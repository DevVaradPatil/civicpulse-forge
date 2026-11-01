// Ingests real, geotagged photos of Bengaluru civic problems from Wikimedia Commons.
//
//   node --env-file=.env.local scripts/ingest-commons.mjs [options]
//
//     --dry-run     fetch, map and report — write nothing, upload nothing
//
// Why this exists: the OpenCity grievances carry no photos (see HANDOFF.md §6),
// so without this the photo side of the product — the before/after slider, the
// triage agent's view, the dedup agent clustering nearby photos — is empty until
// someone files a report live. These are real photographs of real problems at
// real places, taken by real people and published under free licences.
//
// What is curated and what is not:
//   - CURATED (below): which Commons files to take, and which category each one
//     belongs to, with the reason. Every file was looked at by a person before
//     it was listed here; anything that did not clearly show a civic problem
//     was left out.
//   - FETCHED LIVE: everything else — the photo, coordinates, date taken,
//     photographer, licence and description all come from the Commons API at
//     run time and are stored untouched in `source_payload`.
//
// Nothing is invented. Severity stays NULL (no one has rated these), status is
// `reported`, there is no reporter account and no agency — these photos were
// never filed with one. The rows are kept out of the agency/ward accountability
// figures in supabase/schema.sql for the same reason.
//
// Re-running is safe: rows are upserted on (source, source_record_id) and
// photos are uploaded to a stable path.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { geohashForLocation } from "geofire-common";

const SOURCE = "wikimedia_commons";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
// Wikimedia and Nominatim both require an identifying User-Agent.
const USER_AGENT = "CivicPulse-ingest/1.0 (https://github.com/DevVaradPatil/civicpulse-forge)";
const PHOTO_WIDTH = 1280;
const BUCKET = process.env.SUPABASE_BUCKET || "media";

/** Anything outside this box is not a Bengaluru record, whatever its caption says. */
const BENGALURU_BBOX = { minLat: 12.8, maxLat: 13.2, minLng: 77.4, maxLng: 77.85 };

/**
 * The curated selection. `locality` is used ONLY for files with no camera
 * geotag, and is the place named in the file's own title or caption — the
 * coordinates are then the locality's, not the exact spot, and the row says so
 * (`location_source = 'locality'`).
 */
const FILES = [
  { file: "Building construction-demolition-repair waste being dumped in streets in Bengaluru.jpg", category: "waste", why: "construction debris dumped on a residential street" },
  { file: "Rubbish at Rampura Lake (30668110355).jpg", category: "waste", why: "mixed rubbish dumped at the lake edge" },
  { file: "Garbage issue in Vishwapriya Nagar.jpg", category: "waste", why: "garbage piled along a roadside fence" },
  { file: "Dirty wheel-barrow.jpg", category: "waste", why: "garbage strewn around an abandoned cart", locality: "Jayanagar, Bengaluru" },
  { file: "Burning Rubbish at Rampura Lake (30668115225).jpg", category: "pollution", why: "open burning of rubbish, heavy black smoke" },
  { file: "Fire near an arch in Jeevanbheemanagar, Bengaluru.jpg", category: "pollution", why: "fire from burning leaves and garbage beside a road" },
  { file: "Dust Pollution during Borewell drilling in Munekolala 7-12-2012 5-03-22 PM.JPG", category: "pollution", why: "dust plume from borewell drilling" },
  { file: "Flooding in Bangalore.jpg", category: "stormwater", why: "street flooded after heavy rain" },
  { file: "Flooding in Bangalore 2.jpg", category: "stormwater", why: "street flooded after heavy rain, car stranded" },
  { file: "Flooding in Bangalore 3.jpg", category: "stormwater", why: "street flooded after heavy rain" },
  { file: "Flooding in Bangalore 5.jpg", category: "stormwater", why: "street flooded after heavy rain" },
  { file: "Rajakaluve storm water drain Bellandur Lake east.jpg", category: "stormwater", why: "sewage foam in a storm water drain" },
  { file: "Highly Polluted Iblur Lake 8-14-2010 4-43-36 PM.JPG", category: "parks", why: "polluted lake (the source dataset files lakes under Parks, Trees & Lakes)" },
  { file: "The Effect of Rain.jpg", category: "parks", why: "fallen tree and pole across a road" },
  { file: "Traffic Jam near Industrial estate A Reddy.jpg", category: "traffic", why: "traffic congestion on an arterial road" },
  { file: "Roads deformed T munnekollala Bengaluru.jpg", category: "pothole", why: "crumbling road surface and potholes", locality: "Munnekolala, Bengaluru" }, // caption spells it "munnekollala"; OSM does not
];

const DRY_RUN = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DRY_RUN && (!url || !key)) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Use --dry-run to test without a database.");
  process.exit(1);
}
const db = DRY_RUN ? null : createClient(url, key, { auth: { persistSession: false } });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- fetching

/** GET with retry + backoff. Commons answers "too busy" under load. */
async function getJson(target, attempt = 1) {
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status >= 500 || res.status === 429) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} (not retryable)`);
    const json = await res.json();
    if (json?.error) throw new Error(`API error: ${json.error.code ?? JSON.stringify(json.error)}`);
    return json;
  } catch (err) {
    if (attempt >= 4 || String(err.message).includes("not retryable")) {
      throw new Error(`${target.slice(0, 80)}… failed after ${attempt} attempt(s): ${err.message}`);
    }
    const wait = 2 ** attempt * 1000;
    console.warn(`  ! ${err.message} — retry ${attempt}/3 in ${wait}ms`);
    await sleep(wait);
    return getJson(target, attempt + 1);
  }
}

async function fetchCommonsMeta(titles) {
  const qs = new URLSearchParams({
    action: "query",
    format: "json",
    titles: titles.map((t) => `File:${t}`).join("|"),
    prop: "imageinfo|coordinates",
    iiprop: "url|extmetadata|mime|timestamp",
    iiurlwidth: String(PHOTO_WIDTH),
    colimit: "max",
  });
  const json = await getJson(`${COMMONS_API}?${qs}`);
  // The API normalises titles (e.g. underscores); map them back to ours.
  const normalized = new Map((json.query?.normalized ?? []).map((n) => [n.to, n.from]));
  const byTitle = new Map();
  for (const page of Object.values(json.query?.pages ?? {})) {
    const asked = normalized.get(page.title) ?? page.title;
    byTitle.set(asked.replace(/^File:/, ""), page);
  }
  return byTitle;
}

/** Locality centroid from OpenStreetMap, for files with no camera geotag. */
async function geocodeLocality(locality) {
  const qs = new URLSearchParams({ q: locality, format: "jsonv2", limit: "1", countrycodes: "in" });
  const json = await getJson(`${NOMINATIM}?${qs}`);
  await sleep(1100); // Nominatim's usage policy: at most one request per second.
  const hit = Array.isArray(json) ? json[0] : null;
  if (!hit) return null;
  return {
    lat: Number(hit.lat),
    lng: Number(hit.lon),
    displayName: hit.display_name,
    osm: `${hit.osm_type}/${hit.osm_id}`,
  };
}

// ---------------------------------------------------------------- mapping

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

/** extmetadata values are HTML fragments (the artist is often a link). */
function plain(v) {
  return String(v ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/**
 * Commons' DateTimeOriginal arrives as "2016-10-29 06:29", "2012-07-12",
 * "Taken on 22 October 2024, 07:25" or "19 July 2021 (according to Exif
 * data)". Camera clocks are local, so the wall time is read as IST. Returns
 * null for anything else rather than guessing.
 */
function parseTaken(raw) {
  const s = plain(raw);
  let y, mo, d, hh = 0, mm = 0;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) {
    [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [hh, mm] = [Number(m[4]), Number(m[5])];
  } else {
    m = s.match(/(\d{1,2}) ([A-Za-z]+) (\d{4})(?:, (\d{2}):(\d{2}))?/);
    if (!m) return null;
    mo = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    if (!mo) return null;
    [d, y] = [Number(m[1]), Number(m[3])];
    if (m[4]) [hh, mm] = [Number(m[4]), Number(m[5])];
  }
  const wall = Date.UTC(y, mo - 1, d, hh, mm);
  const check = new Date(wall);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  const ms = wall - 5.5 * 3600 * 1000; // Asia/Kolkata
  return ms > Date.now() ? null : ms;
}

/** "Rubbish at Rampura Lake (30668110355).jpg" → "Rubbish at Rampura Lake". */
function titleFromFile(file) {
  return file
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*\(\d{6,}\)$/, "") // Flickr ids appended on transfer
    .replace(/\s+\d{1,2}-\d{1,2}-\d{4}\s+\d{1,2}-\d{2}-\d{2}\s*[AP]M$/i, "") // camera timestamps
    .trim();
}

// ------------------------------------------------- ward (point in polygon)

const wards = JSON.parse(
  readFileSync(new URL("../public/bengaluru-wards.geojson", import.meta.url), "utf8"),
).features;

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The BBMP ward (2015 boundaries, 198 wards) containing a point, or null. */
function wardAt(lat, lng) {
  for (const f of wards) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const [outer, ...holes] of polys) {
      if (inRing(lng, lat, outer) && !holes.some((h) => inRing(lng, lat, h))) {
        return { wardId: f.properties.wardId, name: f.properties.name };
      }
    }
  }
  return null;
}

/** One curated file + its live metadata → one `issues` row, or a skip reason. */
async function mapFile(entry, page, ingestedAt) {
  if (!page || page.missing !== undefined || !page.imageinfo?.length) {
    return { skip: "file not found on Commons (renamed or deleted?)" };
  }
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  const v = (k) => meta[k]?.value;

  const license = plain(v("LicenseShortName"));
  if (!license || !/^(CC|Public domain|PD)/i.test(license)) {
    return { skip: `licence ${JSON.stringify(license)} is not a free licence we can republish` };
  }

  // Location: the camera's geotag, else the locality named in the caption.
  let lat, lng, locationSource, geocode = null;
  const coord = page.coordinates?.[0];
  if (coord) {
    [lat, lng, locationSource] = [coord.lat, coord.lon, "photo_geotag"];
  } else if (entry.locality) {
    geocode = await geocodeLocality(entry.locality);
    if (!geocode) return { skip: `no geotag, and ${JSON.stringify(entry.locality)} did not geocode` };
    [lat, lng, locationSource] = [geocode.lat, geocode.lng, "locality"];
  } else {
    return { skip: "no geotag and no locality in the caption" };
  }
  const b = BENGALURU_BBOX;
  if (!(lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng)) {
    return { skip: `location ${lat},${lng} is outside Bengaluru` };
  }

  const takenAt = parseTaken(v("DateTimeOriginal"));
  const uploadedAt = Date.parse(info.timestamp);
  const createdAt = takenAt ?? uploadedAt;
  if (!Number.isFinite(createdAt)) return { skip: "no usable date" };

  // A locality centroid is too coarse to place in a ward.
  const ward = locationSource === "photo_geotag" ? wardAt(lat, lng) : null;
  const artist = plain(v("Artist")) || info.user || "Unknown";
  const description = plain(v("ImageDescription"));

  return {
    photoUrl: info.thumburl ?? info.url,
    row: {
      title: titleFromFile(entry.file).slice(0, 300),
      description: description.slice(0, 2000),
      category: entry.category,
      severity: null, // nobody has rated these; the triage agent never saw them
      hazards: [],
      status: "reported",
      lat,
      lng,
      geohash: geohashForLocation([lat, lng]),
      photo_path: `issues/commons-${page.pageid}.jpg`,
      location_source: locationSource,
      confirmations: 0,
      confirmed_by: [],
      reporter_id: null,
      reporter_name: null,
      ward: ward?.name ?? null,
      agency: null, // never filed with an agency
      source: SOURCE,
      source_record_id: String(page.pageid),
      source_url: info.descriptionurl,
      source_payload: {
        file: entry.file,
        pageid: page.pageid,
        artist,
        license,
        licenseUrl: plain(v("LicenseUrl")) || null,
        attributionRequired: plain(v("AttributionRequired")) || null,
        credit: plain(v("Credit")) || null,
        dateTimeOriginal: plain(v("DateTimeOriginal")) || null,
        dateBasis: takenAt != null ? "taken" : "uploaded",
        uploadedAt: info.timestamp,
        description,
        categories: plain(v("Categories")) || null,
        imageUrl: info.url,
        coordinates: coord ?? null,
        // Keyed differently from OpenCity's `ward_id` on purpose: ward_choropleth()
        // reads `ward_id` and must keep shading wards by real grievances only.
        derivedWard: ward ? { ...ward, basis: "point in BBMP 2015 ward polygon" } : null,
        geocode: geocode ? { query: entry.locality, ...geocode, provider: "OpenStreetMap Nominatim" } : null,
        curation: { category: entry.category, why: entry.why },
      },
      ingested_at: ingestedAt,
      seed: false,
      created_at: createdAt,
      updated_at: createdAt,
    },
  };
}

async function uploadPhoto(path, photoUrl) {
  const res = await fetch(photoUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`download ${photoUrl} → HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: res.headers.get("content-type") || "image/jpeg",
    upsert: true,
    cacheControl: "31536000",
  });
  if (error) throw new Error(`upload ${path} failed: ${error.message}`);
  return buffer.length;
}

// ---------------------------------------------------------------- run

const started = Date.now();
console.log(`CivicPulse — ingesting ${FILES.length} curated Wikimedia Commons photos`);
if (DRY_RUN) console.log("DRY RUN — nothing will be written or uploaded.\n");

const pages = await fetchCommonsMeta(FILES.map((f) => f.file));
const mapped = [];
const skipped = [];
for (const entry of FILES) {
  const out = await mapFile(entry, pages.get(entry.file), started);
  if (out.skip) skipped.push({ file: entry.file, reason: out.skip });
  else mapped.push(out);
}

for (const { row } of mapped) {
  const p = row.source_payload;
  console.log(
    // Printed in IST, the photos' own local time; toISOString() alone would show UTC.
    `  ${row.category.padEnd(10)} ${new Date(row.created_at + 5.5 * 3600 * 1000).toISOString().slice(0, 10)}  ` +
      `${row.location_source.padEnd(12)} ${(row.ward ?? "-").padEnd(18)} ${row.title.slice(0, 50)}  ` +
      `[${p.license} · ${p.artist.slice(0, 30)}]`,
  );
}
console.log(`\n  mapped: ${mapped.length}   skipped: ${skipped.length}`);
for (const s of skipped) console.log(`    skip ${s.file}: ${s.reason}`);

if (DRY_RUN) {
  console.log("\nDry run complete — nothing written.");
  process.exit(0);
}

console.log("\nUploading photos and upserting rows…");
let written = 0;
for (const { row, photoUrl } of mapped) {
  const bytes = await uploadPhoto(row.photo_path, photoUrl);
  const { error } = await db
    .from("issues")
    .upsert(row, { onConflict: "source,source_record_id", ignoreDuplicates: false });
  if (error) {
    console.error(`\nFAILED on ${row.source_payload.file}: ${error.message}`);
    console.error(`${written} row(s) were written. Re-run to resume — the upsert is idempotent.`);
    process.exit(1);
  }
  written++;
  console.log(`  ${written}/${mapped.length}  ${(bytes / 1024).toFixed(0)} KB  ${row.title.slice(0, 60)}`);
  await sleep(300); // be gentle with upload.wikimedia.org
}

const { count: dbSource, error: cErr } = await db
  .from("issues")
  .select("*", { count: "exact", head: true })
  .eq("source", SOURCE);
if (cErr) {
  console.error(`  could not read back: ${cErr.message}`);
  process.exit(1);
}
console.log(`\nVerified: ${dbSource} row(s) with source=${SOURCE} in the database.`);

const { error: metaErr } = await db.from("meta").upsert({
  key: `ingest:${SOURCE}`,
  value: {
    source: SOURCE,
    datasetUrl: "https://commons.wikimedia.org/",
    resourceName: "Wikimedia Commons — curated geotagged photos of Bengaluru civic issues",
    license: "Per photo (CC BY / CC BY-SA / CC0), credited on each record",
    attribution: "Individual photographers via Wikimedia Commons",
    curated: FILES.length,
    written,
    skipped: skipped.length,
    rowsInDb: dbSource,
    ingestedAt: started,
    durationMs: Date.now() - started,
  },
});
if (metaErr) console.warn(`  could not record provenance in meta: ${metaErr.message}`);

console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
process.exit(0);
