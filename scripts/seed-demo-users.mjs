// Adds DEMO leaderboard users and their reports — invented, for showing the UI.
//
//   node --env-file=.env.local scripts/seed-demo-users.mjs            add / refresh them
//   node --env-file=.env.local scripts/seed-demo-users.mjs --dry-run  show what would change
//   node --env-file=.env.local scripts/seed-demo-users.mjs --remove   delete them again
//
// THESE ARE NOT REAL USERS OR REAL REPORTS. The site-wide footer discloses them.
// - Every user's uid starts with "seed-demo-"; every report has seed = true and
//   a "seed-demo-" reporter, so both can be removed exactly (this script's
//   --remove, or scripts/reset-issues.mjs, which deletes any seed row).
// - Seed rows are excluded from every dashboard / agency / ward figure and from
//   the investigation agent's evidence (supabase/schema.sql, tools.ts).
// - Each report reuses one public photo record's photo, at that photo's own
//   location, and keeps its photographer + licence credit (the licences
//   require it). Severity and hazards were written by hand, not by the triage
//   agent, so ai_confidence stays NULL.
// Points follow the app's real scoring (report 10, confirm 5, verified fix 20).
import { createClient } from "@supabase/supabase-js";

const PREFIX = "seed-demo-";
const POINTS = { report: 10, confirm: 5, resolve: 20 };
const DAY = 86_400_000;

// [name, confirmations, verified fixes]. Report counts come from REPORTS below.
const DEMO_USERS = [
  ["Ananya R.", 60, 11],
  ["Karthik M.", 44, 8],
  ["Fatima S.", 30, 6],
  ["Rohan D.", 23, 3],
  ["Lakshmi N.", 18, 2],
  ["Arjun P.", 10, 1],
  ["Meera K.", 9, 0],
  ["Siddharth B.", 4, 0],
  ["Vikram S.", 38, 7],
  ["Priya H.", 24, 5],
  ["Mohammed A.", 22, 3],
  ["Divya K.", 15, 2],
  ["Naveen G.", 9, 1],
  ["Sneha J.", 7, 0],
  ["Harish T.", 3, 0],
];

// One report per public photo record, keyed by its Commons file name.
// [file, reporter (1-based user index), days ago, title, description, severity, hazards, status, confirmations]
const REPORTS = [
  ["Building construction-demolition-repair waste being dumped in streets in Bengaluru.jpg", 1, 6,
    "Construction debris dumped on the road",
    "Someone has dumped broken bricks and construction waste along the edge of the road. It blocks part of the lane and nobody has cleared it.",
    3, ["obstructs the traffic lane", "risk to two-wheelers"], "verified", 4],
  ["Rubbish at Rampura Lake (30668110355).jpg", 1, 17,
    "Garbage dumped along Rampura Lake",
    "Plastic and household waste piled up at the lake edge. The pile keeps growing every week.",
    3, ["water contamination", "attracts stray animals"], "in_progress", 5],
  ["Garbage issue in Vishwapriya Nagar.jpg", 1, 2,
    "Garbage piling up along the footpath",
    "Waste has been piling up along the fence on this stretch for days. The footpath cannot be used.",
    3, ["blocks the footpath", "unhygienic"], "reported", 2],
  ["Burning Rubbish at Rampura Lake (30668115225).jpg", 2, 15,
    "Garbage being burnt near Rampura Lake",
    "Thick black smoke from waste being burnt near the lake in the morning. Hard to breathe walking past.",
    4, ["toxic smoke", "fire risk"], "verified", 3],
  ["Flooding in Bangalore.jpg", 2, 9,
    "Road flooded after the rain in Tatanagar",
    "The road has not drained since the heavy rain. Vehicles and people are wading through the water.",
    4, ["vehicles stalling", "potholes hidden under water"], "verified", 4],
  ["Dirty wheel-barrow.jpg", 3, 12,
    "Abandoned cart and waste on the roadside",
    "An old cart has been left here and people keep dumping garbage around it.",
    2, [], "reported", 1],
  ["Flooding in Bangalore 3.jpg", 3, 9,
    "Waterlogging blocking the whole road",
    "Flood water across the full width of the road. Even the road-work machines parked here are standing in it.",
    4, ["road blocked"], "verified", 3],
  ["Fire near an arch in Jeevanbheemanagar, Bengaluru.jpg", 9, 20,
    "Fire from burning leaves and garbage by the road",
    "Leaves and garbage set on fire right beside the road and the shops. The flames were close to the wall.",
    4, ["fire risk", "smoke over the road"], "verified", 3],
  ["Flooding in Bangalore 2.jpg", 9, 9,
    "Car stuck in a waterlogged street",
    "The street is completely waterlogged. A car is stuck and people are walking through dirty water.",
    4, ["vehicles stranded", "risk of slipping"], "in_progress", 5],
  ["Dust Pollution during Borewell drilling in Munekolala 7-12-2012 5-03-22 PM.JPG", 10, 4,
    "Heavy dust from borewell drilling",
    "Borewell drilling is throwing up a large dust cloud over the houses nearby.",
    2, ["dust inhalation"], "reported", 1],
  ["Flooding in Bangalore 5.jpg", 4, 8,
    "Road and footpath still under water",
    "Water is still standing on the road and the footpath hours after the rain stopped.",
    3, ["pedestrians forced onto the road"], "reported", 2],
  ["Rajakaluve storm water drain Bellandur Lake east.jpg", 11, 13,
    "Foam and sewage in the storm water drain",
    "White foam and sewage flowing in the rajakaluve next to Bellandur Lake, with a strong smell.",
    4, ["health hazard", "foul smell"], "verified", 4],
  ["Highly Polluted Iblur Lake 8-14-2010 4-43-36 PM.JPG", 5, 22,
    "Iblur Lake badly polluted",
    "The lake water is dirty and choked with weeds near the apartments.",
    3, ["water pollution", "mosquito breeding"], "reported", 2],
  ["The Effect of Rain.jpg", 12, 3,
    "Fallen tree and pole blocking the road",
    "A tree came down in the rain and brought a pole with it. Half the road is blocked.",
    4, ["road blocked", "fallen pole"], "in_progress", 3],
  ["Traffic Jam near Industrial estate A Reddy.jpg", 6, 11,
    "Daily traffic jam near the industrial estate",
    "Traffic is stuck here every evening. There is no one managing the junction.",
    2, [], "reported", 1],
  ["Roads deformed T munnekollala Bengaluru.jpg", 13, 5,
    "Road surface crumbling into potholes",
    "The tar has broken up into potholes along this road after the rains.",
    4, ["risk to two-wheelers"], "verified", 3],
];

const DRY_RUN = process.argv.includes("--dry-run");
const REMOVE = process.argv.includes("--remove");

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const uidOf = (i) => `${PREFIX}${i}`;

async function removeDemoReports() {
  const { error } = await db.from("issues").delete().eq("seed", true).like("reporter_id", `${PREFIX}%`);
  if (error) throw new Error(`delete demo reports: ${error.message}`);
}

if (REMOVE) {
  const { count: nIssues } = await db.from("issues").select("*", { count: "exact", head: true })
    .eq("seed", true).like("reporter_id", `${PREFIX}%`);
  const { count: nUsers } = await db.from("users").select("*", { count: "exact", head: true })
    .like("uid", `${PREFIX}%`);
  console.log(`${DRY_RUN ? "Would delete" : "Deleting"} ${nIssues} demo report(s) and ${nUsers} demo user(s).`);
  if (!DRY_RUN) {
    await removeDemoReports();
    const { error } = await db.from("users").delete().like("uid", `${PREFIX}%`);
    if (error) throw new Error(error.message);
  }
  process.exit(0);
}

// The photo records the reports reuse: location, ward, category, photo, credit.
const { data: photos, error: pErr } = await db
  .from("issues")
  .select("lat, lng, geohash, ward, category, photo_path, location_source, source_url, source_payload")
  .eq("source", "wikimedia_commons");
if (pErr) throw new Error(pErr.message);
const byFile = new Map(photos.map((p) => [p.source_payload?.file, p]));

const now = Date.now();
const reportCount = new Map();
const issues = REPORTS.map(([file, who, daysAgo, title, description, severity, hazards, status, confirmations], n) => {
  const photo = byFile.get(file);
  if (!photo) throw new Error(`no public photo record for ${file} — run scripts/ingest-commons.mjs first`);
  reportCount.set(who, (reportCount.get(who) ?? 0) + 1);
  // Confirmed by other demo users, never by the reporter.
  const confirmedBy = [];
  // Walks every user once (step 1), starting at an offset that varies per report.
  for (let k = 0; k < DEMO_USERS.length && confirmedBy.length < confirmations; k++) {
    const other = ((who + n + k) % DEMO_USERS.length) + 1;
    if (other !== who) confirmedBy.push(uidOf(other));
  }
  // Spread through the day so reports don't all share a timestamp.
  const createdAt = now - daysAgo * DAY - ((n * 37) % 600) * 60_000;
  const p = photo.source_payload;
  return {
    title, description, category: photo.category, severity, hazards, status,
    lat: photo.lat, lng: photo.lng, geohash: photo.geohash, ward: photo.ward,
    photo_path: photo.photo_path, location_source: photo.location_source,
    confirmations, confirmed_by: confirmedBy,
    reporter_id: uidOf(who), reporter_name: DEMO_USERS[who - 1][0],
    ai_confidence: null, agency: null, source: null,
    source_url: photo.source_url,
    source_payload: {
      demo: true,
      note: "Demo seed report. Photo reused from a public photo record, with its credit.",
      file, artist: p.artist, license: p.license, licenseUrl: p.licenseUrl,
    },
    seed: true, created_at: createdAt, updated_at: createdAt,
  };
});

const users = DEMO_USERS.map(([name, confirm, resolve], i) => {
  const report = reportCount.get(i + 1) ?? 0;
  return {
    uid: uidOf(i + 1), display_name: name,
    points: report * POINTS.report + confirm * POINTS.confirm + resolve * POINTS.resolve,
    report_count: report, confirm_count: confirm, resolve_count: resolve, updated_at: now,
  };
});

for (const u of users) {
  console.log(`  ${u.uid.padEnd(13)} ${u.display_name.padEnd(14)} ${String(u.points).padStart(4)} pts` +
    `  (${u.report_count} reports, ${u.confirm_count} confirms, ${u.resolve_count} fixes)`);
}
console.log(`\n  ${issues.length} demo reports:`);
for (const r of issues) console.log(`    ${r.reporter_name.padEnd(13)} ${r.status.padEnd(11)} ${r.title}`);
if (DRY_RUN) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

await removeDemoReports(); // replace, so re-running never duplicates
const { error: iErr } = await db.from("issues").insert(issues);
if (iErr) throw new Error(`insert reports: ${iErr.message}`);
const { error: uErr } = await db.from("users").upsert(users, { onConflict: "uid" });
if (uErr) throw new Error(`upsert users: ${uErr.message}`);

const { count: nIssues } = await db.from("issues").select("*", { count: "exact", head: true })
  .eq("seed", true).like("reporter_id", `${PREFIX}%`);
const { count: nUsers } = await db.from("users").select("*", { count: "exact", head: true }).like("uid", `${PREFIX}%`);
console.log(`\n${nUsers} demo user(s) and ${nIssues} demo report(s) in the database. Remove with --remove.`);
process.exit(0);
