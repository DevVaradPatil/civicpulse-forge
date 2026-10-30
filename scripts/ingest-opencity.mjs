// Ingests real Bengaluru civic grievances into Supabase from the OpenCity CKAN API.
//
//   node --env-file=.env.local scripts/ingest-opencity.mjs [options]
//
//     --dry-run     fetch, map and report — write nothing
//     --limit N     stop after N source records (for a quick smoke test)
//     --verbose     print every skipped record's reason
//
// Source: "I Change My City Complaints Log - 2019 - 2022" (Janaagraha iCMyC),
// published on OpenCity under CC-BY-SA.
//   https://data.opencity.in/dataset/i-change-my-city-data
//
// The script never invents a value. Fields the source does not provide
// (severity, photo, reporter) are left NULL, the untouched source record is
// stored on every row as `source_payload`, and `source_url` is a URL that
// returns exactly that one record. Re-running is safe: rows are upserted on
// (source, source_record_id).
import { createClient } from "@supabase/supabase-js";
import { geohashForLocation } from "geofire-common";
import {
  categoryFromSource,
  statusFromSource,
  normalizeAgency,
} from "../src/lib/domain.ts";

const SOURCE = "opencity";
const RESOURCE_ID = "a60abf5c-3a15-4967-af32-c3074248580f";
const CKAN = "https://data.opencity.in/api/3/action";
const DATASET_URL = "https://data.opencity.in/dataset/i-change-my-city-data";
const PAGE_SIZE = 1000;
const BATCH_SIZE = 500;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const VERBOSE = argv.includes("--verbose");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  if (i === -1) return Infinity;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n <= 0) {
    console.error("--limit needs a positive number.");
    process.exit(1);
  }
  return n;
})();

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY_RUN && (!url || !key)) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use --dry-run to test without a database.");
  process.exit(1);
}
const db = DRY_RUN ? null : createClient(url, key, { auth: { persistSession: false } });

// ---------------------------------------------------------------- fetching

/** GET with retry + exponential backoff — the CKAN endpoint is public and rate-limited. */
async function getJson(endpoint, params, attempt = 1) {
  const qs = new URLSearchParams(params).toString();
  const target = `${CKAN}/${endpoint}?${qs}`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(60_000) });
    if (res.status >= 500 || res.status === 429) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} (not retryable)`);
    const json = await res.json();
    if (!json.success) throw new Error(`CKAN error: ${JSON.stringify(json.error)}`);
    return json.result;
  } catch (err) {
    if (attempt >= 4 || String(err.message).includes("not retryable")) {
      throw new Error(`${endpoint} failed after ${attempt} attempt(s): ${err.message}`);
    }
    const wait = 2 ** attempt * 500;
    console.warn(`  ! ${endpoint} ${err.message} — retry ${attempt}/3 in ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
    return getJson(endpoint, params, attempt + 1);
  }
}

// ---------------------------------------------------------------- mapping

/** The dataset's own marker for a missing value is the literal string "NULL". */
function clean(v) {
  const s = (v ?? "").toString().trim();
  if (!s || s.toUpperCase() === "NULL" || s === "N/A") return null;
  return s;
}

/**
 * `created_at` arrives in two shapes — "7/31/2022 14:03" and "1-1-2019 06:33".
 * Both are MONTH-first: parsing the whole dataset month-first and sorting by the
 * source's own `_id` yields 0 chronological inversions, while day-first yields
 * 13,793. Verified across all 16,071 records before this was written.
 */
function parseCreatedAt(raw) {
  const s = clean(raw);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const [, mon, day, year, hh, mm] = m.map(Number);
  if (mon < 1 || mon > 12 || day < 1 || day > 31 || hh > 23 || mm > 59) return null;
  // Validate the calendar date before shifting timezone, or anything stamped
  // before 05:30 IST would land on the previous UTC day and look invalid.
  const wall = Date.UTC(year, mon - 1, day, hh, mm);
  const d = new Date(wall);
  if (d.getUTCMonth() !== mon - 1 || d.getUTCDate() !== day) return null; // e.g. Feb 31
  // Asia/Kolkata (UTC+5:30) — the portal is Bengaluru-local.
  const ms = wall - 5.5 * 3600 * 1000;
  if (ms > Date.now()) return null;
  return ms;
}

/**
 * Builds `ward_id` → `ward_title` from the records that do carry a name, so the
 * handful whose `ward_title` is the literal "NULL" can be filled in from the
 * dataset's own mapping. Verified 1:1 across all 16,071 records (198 ward ids,
 * zero ids with conflicting names) before relying on it. Nothing is invented:
 * the name comes from other rows of the same source.
 */
function buildWardNames(records) {
  const byId = new Map();
  const conflicts = new Set();
  for (const rec of records) {
    const id = clean(rec.ward_id);
    const name = clean(rec.ward_title);
    if (!id || !name) continue;
    const seen = byId.get(id);
    if (seen && seen !== name) conflicts.add(id);
    else byId.set(id, name);
  }
  // If the source ever stops being 1:1, drop those ids rather than guess.
  for (const id of conflicts) byId.delete(id);
  return { byId, conflicts };
}

/** One source record → one `issues` row, or a skip reason. */
function mapRecord(rec, ingestedAt, wardNames) {
  const sourceRecordId = clean(rec._id);
  if (!sourceRecordId) return { skip: "no source _id" };

  const lat = Number(rec.latitude);
  const lng = Number(rec.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { skip: "missing or unusable coordinates" };
  }

  const createdAt = parseCreatedAt(rec.created_at);
  if (createdAt === null) {
    return { skip: `unparseable created_at ${JSON.stringify(rec.created_at)}` };
  }

  const title = clean(rec.title);
  if (!title) return { skip: "no title" };

  const status = statusFromSource(rec.complaint_status_title);
  if (!status) {
    return { skip: `unmapped status ${JSON.stringify(rec.complaint_status_title)}` };
  }

  // A URL that returns exactly this one record, so any claim is checkable.
  const sourceUrl =
    `${CKAN}/datastore_search?resource_id=${RESOURCE_ID}` +
    `&filters=${encodeURIComponent(JSON.stringify({ _id: Number(sourceRecordId) }))}`;

  return {
    row: {
      title: title.slice(0, 300),
      description: clean(rec.description) ?? "",
      category: categoryFromSource(rec.category_title, rec.sub_category_title),
      // No severity in the source. The AI triage agent sets it for citizen
      // photo reports only; inventing one here would be a fabricated number.
      severity: null,
      hazards: [],
      status,
      lat,
      lng,
      geohash: geohashForLocation([lat, lng]),
      photo_path: null, // official records carry no photo
      confirmations: 0,
      confirmed_by: [],
      reporter_id: null,
      reporter_name: null,
      // Falls back to the name other rows give this ward_id; stays null if the
      // source offers no name anywhere.
      ward: clean(rec.ward_title) ?? wardNames.get(clean(rec.ward_id)) ?? null,
      agency: normalizeAgency(rec.civic_agency_title),
      source: SOURCE,
      source_record_id: sourceRecordId,
      source_url: sourceUrl,
      source_payload: rec,
      ingested_at: ingestedAt,
      seed: false,
      created_at: createdAt,
      updated_at: createdAt,
    },
  };
}

// ---------------------------------------------------------------- run

const started = Date.now();
console.log(`CivicPulse — ingesting ${SOURCE} resource ${RESOURCE_ID}`);
if (DRY_RUN) console.log("DRY RUN — nothing will be written.\n");

const meta = await getJson("resource_show", { id: RESOURCE_ID });
console.log(`Source: ${meta.name}`);
console.log(`  dataset        ${DATASET_URL}`);
console.log(`  last_modified  ${meta.last_modified}`);
console.log(`  datastore      ${meta.datastore_active ? "active" : "INACTIVE"}\n`);

const raw = [];
const rows = [];
const skipped = [];
let fetched = 0;
let total = Infinity;
let offset = 0;

while (offset < total && fetched < LIMIT) {
  const limit = Math.min(PAGE_SIZE, LIMIT - fetched);
  const page = await getJson("datastore_search", {
    resource_id: RESOURCE_ID,
    limit,
    offset,
  });
  total = page.total;
  const records = page.records ?? [];
  if (!records.length) break;

  raw.push(...records);
  fetched += records.length;
  offset += records.length;
  process.stdout.write(`\r  fetched ${fetched}/${Math.min(total, LIMIT)}   `);
}

// Mapping runs after the fetch so the ward-name lookup can draw on every record.
const { byId: wardNames, conflicts } = buildWardNames(raw);
if (conflicts.size) {
  console.warn(`\n  ! ${conflicts.size} ward_id(s) have conflicting names — left blank`);
}
let wardsRecovered = 0;
for (const rec of raw) {
  const out = mapRecord(rec, started, wardNames);
  if (out.skip) {
    skipped.push({ id: rec._id, reason: out.skip });
    continue;
  }
  if (!clean(rec.ward_title) && out.row.ward) wardsRecovered++;
  rows.push(out.row);
}

console.log(`\n  source total reported by CKAN: ${total}`);
if (wardsRecovered) {
  console.log(`  ward names recovered from ward_id: ${wardsRecovered}`);
}
console.log(`  fetched: ${fetched}   mapped: ${rows.length}   skipped: ${skipped.length}`);

if (skipped.length) {
  const byReason = new Map();
  for (const s of skipped) {
    const k = s.reason.replace(/".*"/, '"…"');
    byReason.set(k, (byReason.get(k) ?? 0) + 1);
  }
  console.log("  skip reasons:");
  for (const [reason, n] of [...byReason].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${n}\t${reason}`);
  }
  if (VERBOSE) for (const s of skipped) console.log(`    _id=${s.id}: ${s.reason}`);
}

// Duplicate source ids would silently collapse on upsert — surface them instead.
const ids = new Set();
const dupes = rows.filter((r) => (ids.has(r.source_record_id) ? true : (ids.add(r.source_record_id), false)));
if (dupes.length) console.warn(`  ! ${dupes.length} duplicate source_record_id(s) in the feed`);

const tally = (fn) => {
  const m = new Map();
  for (const r of rows) {
    const k = fn(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};
console.log("\n  by status:   " + tally((r) => r.status).map(([k, v]) => `${k}=${v}`).join("  "));
console.log("  by agency:   " + tally((r) => r.agency ?? "unassigned").map(([k, v]) => `${k}=${v}`).join("  "));
console.log("  by category: " + tally((r) => r.category).map(([k, v]) => `${k}=${v}`).join("  "));
console.log("  wards:       " + new Set(rows.map((r) => r.ward).filter(Boolean)).size);
const times = rows.map((r) => r.created_at);
if (times.length) {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  console.log(`  date range:  ${iso(Math.min(...times))} → ${iso(Math.max(...times))}`);
}

if (DRY_RUN) {
  console.log("\nDry run complete — nothing written.");
  process.exit(0);
}

// ---------------------------------------------------------------- upsert

console.log(`\nUpserting ${rows.length} row(s) in batches of ${BATCH_SIZE}…`);
let written = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await db
      .from("issues")
      .upsert(batch, { onConflict: "source,source_record_id", ignoreDuplicates: false });
    if (!error) {
      lastErr = null;
      break;
    }
    lastErr = error;
    console.warn(`  ! batch ${i / BATCH_SIZE + 1} ${error.message} — retry ${attempt}/3`);
    await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
  }
  if (lastErr) {
    console.error(`\nFAILED on batch starting at row ${i}: ${lastErr.message}`);
    console.error(`${written} row(s) were written. Re-run to resume — the upsert is idempotent.`);
    process.exit(1);
  }
  written += batch.length;
  process.stdout.write(`\r  written ${written}/${rows.length}   `);
}

// ---------------------------------------------------- verify against the DB

console.log("\n\nVerifying against the live database…");
const { count: dbTotal, error: cErr } = await db
  .from("issues")
  .select("*", { count: "exact", head: true });
if (cErr) {
  console.error(`  could not read back: ${cErr.message}`);
  process.exit(1);
}
const { count: dbSource } = await db
  .from("issues")
  .select("*", { count: "exact", head: true })
  .eq("source", SOURCE);
console.log(`  issues rows total:          ${dbTotal}`);
console.log(`  rows with source=${SOURCE}:  ${dbSource}`);

const { data: agencyMap, error: rpcErr } = await db.rpc("category_agency_counts");
if (rpcErr) {
  console.warn(`  category_agency_counts() unavailable: ${rpcErr.message}`);
} else {
  const dominant = new Map();
  for (const r of agencyMap ?? []) if (!dominant.has(r.category)) dominant.set(r.category, r);
  console.log("  derived category → agency (from the rows just written):");
  for (const [cat, r] of dominant) console.log(`    ${cat.padEnd(15)} → ${r.agency} (${r.n})`);
}

// Record the run itself, so the UI can cite where the data came from and when.
// A --limit run is a partial smoke test: it must not overwrite the provenance
// of a full ingest with its own smaller numbers.
const partial = LIMIT !== Infinity;
if (partial) {
  console.log(`\n  (partial run: --limit ${LIMIT}) provenance in meta left untouched`);
} else {
  const { error: metaErr } = await db.from("meta").upsert({
    key: `ingest:${SOURCE}`,
    value: {
      source: SOURCE,
      datasetUrl: DATASET_URL,
      resourceId: RESOURCE_ID,
      resourceName: meta.name,
      license: "Creative Commons Attribution Share-Alike",
      attribution: "Janaagraha iCMyC via OpenCity",
      sourceLastModified: meta.last_modified,
      sourceTotal: total,
      fetched,
      written,
      skipped: skipped.length,
      // What is actually in the table now — the number the UI should cite.
      rowsInDb: dbSource,
      ingestedAt: started,
      durationMs: Date.now() - started,
    },
  });
  if (metaErr) console.warn(`  could not record provenance in meta: ${metaErr.message}`);
}

console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
process.exit(0);
