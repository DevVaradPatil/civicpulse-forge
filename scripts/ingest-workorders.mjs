// Ingests BBMP ward work orders into Supabase from the OpenCity CKAN API.
//
//   node --env-file=.env.local scripts/ingest-workorders.mjs [options]
//
//     --dry-run     fetch, map and report — write nothing
//     --limit N     stop after N ward resources (quick smoke test)
//     --verbose     print every skipped record's reason
//
// Source: "BBMP Work Orders by Ward (2013-2022)", OpenCity, Public Domain.
//   https://data.opencity.in/dataset/bbmp-work-orders-by-ward-2013-2022
//
// The dataset is split into one resource per ward, and the ward number lives
// in the resource name as "(Num-198)". That number is the join key to the
// grievance records and to the ward boundaries, so a resource whose number
// cannot be read is skipped rather than guessed at.
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SOURCE = "opencity-workorders";
const CKAN = "https://data.opencity.in/api/3/action";
const DATASET_QUERY = "BBMP Work Orders by Ward";
const DATASET_URL = "https://data.opencity.in/dataset/bbmp-work-orders-by-ward-2013-2022";
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

/** GET with retry + exponential backoff. */
async function getJson(endpoint, params, attempt = 1) {
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${CKAN}/${endpoint}?${qs}`, { signal: AbortSignal.timeout(60_000) });
    if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} (not retryable)`);
    const json = await res.json();
    if (!json.success) throw new Error(`CKAN error: ${JSON.stringify(json.error)}`);
    return json.result;
  } catch (err) {
    if (attempt >= 4 || String(err.message).includes("not retryable")) {
      throw new Error(`${endpoint} failed after ${attempt} attempt(s): ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    return getJson(endpoint, params, attempt + 1);
  }
}

/**
 * Stable identity for a published row, ignoring the fields that only describe
 * its position in a particular upload (`_id`, and the unnamed index column).
 * Two identical rows in two resources are one record, not two.
 */
function contentKey(rec) {
  const stable = Object.keys(rec)
    .filter((k) => k !== "_id" && k !== "0")
    .sort()
    .map((k) => `${k}=${String(rec[k] ?? "")}`)
    .join("\u0001");
  return createHash("sha1").update(stable).digest("hex").slice(0, 24);
}

const clean = (v) => {
  const s = (v ?? "").toString().trim();
  if (!s || s.toUpperCase() === "NULL" || s === "N/A") return null;
  return s;
};

/** Amounts are published as plain rupee strings; some carry separators. */
function money(v) {
  const s = String(v ?? "").replace(/[₹,\s]/g, "").trim();
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "Work Orders for Hemmigepura(Num-198) Ward" -> { wardId: 198, ward: "Hemmigepura" }. */
function wardFromResourceName(name) {
  const m = String(name ?? "").match(/^Work Orders for\s*(.*?)\s*\(\s*Num[-\s]*(\d+)\s*\)/i);
  if (!m) return null;
  const wardId = Number(m[2]);
  if (!Number.isInteger(wardId) || wardId < 1) return null;
  return { wardId, ward: m[1].replace(/\s*ward\s*$/i, "").trim() || null };
}

/** "022 Vishwanath Nagenahalli" -> { wardId: 22, ward: "Vishwanath Nagenahalli" }. */
function wardFromRow(value) {
  const m = String(value ?? "").match(/^\s*(\d{1,3})\s+(.+?)\s*$/);
  if (!m) return null;
  const wardId = Number(m[1]);
  if (!Number.isInteger(wardId) || wardId < 1 || wardId > 250) return null;
  return { wardId, ward: m[2].trim() || null };
}

/** "28-Dec-2021" -> epoch ms, or null. */
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
function parseDate(v) {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mon = MONTHS.indexOf(m[2].toLowerCase());
  if (mon < 0) return null;
  const ms = Date.UTC(Number(m[3]), mon, Number(m[1]));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * The dataset ships two row formats. One is terse (wodetails/amount), the
 * other is richer (Name of Work/Gross/Budget Head/dates). Read whichever is
 * present rather than assuming one, which is what made 86% of amounts look
 * unparseable on the first pass.
 */
function mapRow(rec, res) {
  const fromRow = wardFromRow(rec.Ward);
  const ward = fromRow ?? { wardId: res.wardId, ward: res.ward };
  const details = clean(rec.wodetails) ?? clean(rec["Name of Work"]) ?? "";

  return {
    ward,
    wardSource: fromRow ? "row" : "resource-name",
    disagrees: Boolean(fromRow && fromRow.wardId !== res.wardId),
    row: {
      ward_id: ward.wardId,
      ward: ward.ward,
      wo_num: clean(rec["wo num"]) ?? clean(rec["Job Number"]),
      details,
      contractor: clean(rec.contractor) ?? clean(rec.Contractor),
      amount: money(rec.amount ?? rec.Gross),
      nett: money(rec.nett ?? rec.Nett),
      deduction: money(rec.deduction ?? rec.Deduction),
      budget_head: clean(rec["Budget Head"]),
      office: clean(rec.Office),
      started_on: parseDate(rec["Start Date"]),
      ended_on: parseDate(rec["End Date"]),
      ward_source: fromRow ? "row" : "resource-name",
    },
  };
}

const started = Date.now();
console.log(`CivicPulse — ingesting ${SOURCE}`);
if (DRY_RUN) console.log("DRY RUN — nothing will be written.\n");

// ---------------------------------------------------------------- resources

const search = await getJson("package_search", { q: DATASET_QUERY, rows: 5 });
const pkg = (search.results ?? []).find((p) => /work orders by ward/i.test(p.title));
if (!pkg) {
  console.error("Could not find the work-orders dataset on OpenCity.");
  process.exit(1);
}
console.log(`Source: ${pkg.title}`);
console.log(`  dataset  ${DATASET_URL}`);
console.log(`  license  ${pkg.license_title ?? "unstated"}\n`);

const resources = [];
const unreadable = [];
for (const r of pkg.resources ?? []) {
  if (!r.datastore_active) continue;
  const w = wardFromResourceName(r.name);
  if (!w) {
    unreadable.push(r.name);
    continue;
  }
  resources.push({ ...w, id: r.id, name: r.name });
}
console.log(`  ward resources with a readable ward number: ${resources.length}`);
if (unreadable.length) {
  console.log(`  skipped (no ward number in the name): ${unreadable.length}`);
  if (VERBOSE) for (const n of unreadable) console.log(`    ${n}`);
}

const targets = resources.slice(0, LIMIT === Infinity ? resources.length : LIMIT);

// ---------------------------------------------------------------- fetching

const rows = [];
const skipped = [];
let amountOk = 0;
let amountBad = 0;
const perWardAmountGaps = [];
/** Resources whose filename ward number disagrees with their rows' own ward. */
const wardDisagreements = new Map();
let fetched = 0;

for (const [idx, res] of targets.entries()) {
  let offset = 0;
  let total = Infinity;
  let wardRows = 0;
  let wardBadAmounts = 0;

  while (offset < total) {
    const page = await getJson("datastore_search", {
      resource_id: res.id,
      limit: PAGE_SIZE,
      offset,
    });
    total = page.total;
    const records = page.records ?? [];
    if (!records.length) break;

    for (const rec of records) {
      const recId = clean(rec._id);
      if (!recId) {
        skipped.push({ ward: res.wardId, reason: "no record id" });
        continue;
      }

      const mapped = mapRow(rec, res);
      if (mapped.row.amount === null) {
        amountBad++;
        wardBadAmounts++;
      } else {
        amountOk++;
      }
      if (mapped.disagrees) {
        const key = `${res.wardId}->${mapped.ward.wardId}`;
        wardDisagreements.set(key, (wardDisagreements.get(key) ?? 0) + 1);
      }

      rows.push({
        ...mapped.row,
        source: SOURCE,
        // Keyed on the row's own content, not on which resource it came from.
        // Some wards are published twice: the Num-21 and Num-22 resources are
        // byte-identical uploads of ward 022, so a resource-based key would
        // store both copies and double that ward's spend.
        source_record_id: `${mapped.ward.wardId}:${contentKey(rec)}`,
        source_url:
          `${CKAN}/datastore_search?resource_id=${res.id}` +
          `&filters=${encodeURIComponent(JSON.stringify({ _id: Number(recId) }))}`,
        source_payload: rec,
        ingested_at: started,
      });
      wardRows++;
    }
    offset += records.length;
  }

  fetched += wardRows;
  if (wardBadAmounts) {
    perWardAmountGaps.push({ ward: res.wardId, name: res.ward, bad: wardBadAmounts, of: wardRows });
  }
  process.stdout.write(`\r  ward ${idx + 1}/${targets.length} — ${fetched} orders   `);
}
console.log("");

// ------------------------------------------------------------- what we got

// Collapse rows republished under more than one resource before reporting
// anything, so the totals match what will actually be stored.
const byKey = new Map();
let duplicateRows = 0;
for (const r of rows) {
  const k = `${r.source}|${r.source_record_id}`;
  if (byKey.has(k)) duplicateRows++;
  else byKey.set(k, r);
}
rows.length = 0;
rows.push(...byKey.values());
if (duplicateRows) {
  console.log(`  duplicate rows collapsed: ${duplicateRows.toLocaleString("en-IN")}`);
}

// Recount after dedupe so every figure below describes the same set of rows.
amountOk = rows.filter((r) => r.amount !== null).length;
amountBad = rows.length - amountOk;

const amounts = rows.map((r) => r.amount).filter((v) => v !== null);
const sum = amounts.reduce((a, b) => a + b, 0);
const sorted = [...amounts].sort((a, b) => a - b);
const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
const crore = (n) => (n / 1e7).toFixed(2);
const lakh = (n) => (n / 1e5).toFixed(2);

console.log(`\n  work orders mapped : ${rows.length.toLocaleString("en-IN")}`);
console.log(`  wards covered      : ${new Set(rows.map((r) => r.ward_id)).size}`);
console.log(`  skipped            : ${skipped.length}`);
console.log(
  `  amount parsed      : ${amountOk.toLocaleString("en-IN")} ok, ${amountBad.toLocaleString("en-IN")} unparseable ` +
    `(${((amountOk / Math.max(amountOk + amountBad, 1)) * 100).toFixed(1)}% usable)`,
);
if (perWardAmountGaps.length) {
  console.log(`  wards with any unparseable amount: ${perWardAmountGaps.length}`);
  for (const g of perWardAmountGaps.slice(0, 8)) {
    console.log(`    ward ${g.ward} ${g.name ?? ""}: ${g.bad} of ${g.of}`);
  }
}
console.log(`  total recorded     : Rs ${crore(sum)} crore`);
console.log(`  median order       : Rs ${lakh(median)} lakh`);

const byWardSource = rows.reduce((m, r) => {
  m[r.ward_source] = (m[r.ward_source] ?? 0) + 1;
  return m;
}, {});
console.log(`  ward attributed by : ${JSON.stringify(byWardSource)}`);
if (wardDisagreements.size) {
  console.log(`  ! resources misfiled under the wrong ward number: ${wardDisagreements.size}`);
  for (const [k, n] of wardDisagreements) {
    console.log(`      resource says ward ${k.split("->")[0]}, rows say ${k.split("->")[1]} (${n} rows) — rows win`);
  }
}

if (DRY_RUN) {
  console.log("\nDry run complete — nothing written.");
  process.exit(0);
}

// ---------------------------------------------------------------- upsert

console.log(`\nUpserting ${rows.length.toLocaleString("en-IN")} row(s)…`);
let written = 0;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await db
      .from("work_orders")
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
    console.error(`\nFAILED at row ${i}: ${lastErr.message}`);
    console.error(`${written} row(s) written. Re-run to resume — the upsert is idempotent.`);
    process.exit(1);
  }
  written += batch.length;
  process.stdout.write(`\r  written ${written}/${rows.length}   `);
}

// ---------------------------------------------------- verify against the DB

console.log("\n\nVerifying against the live database…");
const { count, error: cErr } = await db
  .from("work_orders")
  .select("*", { count: "exact", head: true });
if (cErr) {
  console.error(`  could not read back: ${cErr.message}`);
  process.exit(1);
}
console.log(`  work_orders rows: ${count?.toLocaleString("en-IN")}`);

const { data: spend, error: sErr } = await db.rpc("ward_spend");
if (sErr) {
  console.warn(`  ward_spend() unavailable: ${sErr.message}`);
} else {
  console.log(`  wards with spend: ${spend.length}`);
  console.log("  highest spend:");
  for (const w of spend.slice(0, 5)) {
    console.log(
      `    ward ${String(w.ward_id).padStart(3)} ${String(w.ward ?? "").padEnd(18)} ` +
        `Rs ${crore(Number(w.total_amount))} crore across ${w.orders} orders`,
    );
  }
}

if (LIMIT === Infinity) {
  const { error: metaErr } = await db.from("meta").upsert({
    key: `ingest:${SOURCE}`,
    value: {
      source: SOURCE,
      datasetUrl: DATASET_URL,
      resourceName: pkg.title,
      license: pkg.license_title ?? "unstated",
      attribution: "BBMP via OpenCity",
      wardResources: targets.length,
      fetched: rows.length,
      written,
      amountParsed: amountOk,
      amountUnparseable: amountBad,
      totalAmount: sum,
      rowsInDb: count,
      ingestedAt: started,
      durationMs: Date.now() - started,
    },
  });
  if (metaErr) console.warn(`  could not record provenance: ${metaErr.message}`);
} else {
  console.log(`\n  (partial run: --limit ${LIMIT}) provenance in meta left untouched`);
}

console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
process.exit(0);
