// Removes seed-created demo data (dev utility).
//
//   node --env-file=.env.local scripts/reset-issues.mjs         → delete ONLY seed-* data
//   node --env-file=.env.local scripts/reset-issues.mjs --all   → delete EVERYTHING (destructive!)
import { createClient } from "@supabase/supabase-js";

const ALL = process.argv.includes("--all");
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const isSeedId = (v) => typeof v === "string" && v.startsWith("seed-");

const { data: issueRows } = await db.from("issues").select("id, seed, reporter_id");
const { data: userRows } = await db.from("users").select("uid");
const issues = issueRows ?? [];
const users = userRows ?? [];

const delIssues = ALL ? issues : issues.filter((r) => r.seed === true || isSeedId(r.reporter_id));
const delUsers = ALL ? users : users.filter((r) => isSeedId(r.uid));

if (!ALL) {
  console.log(
    "Preserving " + (issues.length - delIssues.length) + " real issue(s) and " +
      (users.length - delUsers.length) + " real user(s).",
  );
} else {
  console.warn("--all: deleting ALL issues and users, including real ones!");
}

if (delIssues.length) await db.from("issues").delete().in("id", delIssues.map((r) => r.id));
if (delUsers.length) await db.from("users").delete().in("uid", delUsers.map((r) => r.uid));
await db.from("meta").delete().eq("key", "insights");

console.log("Deleted " + delIssues.length + " issue(s) and " + delUsers.length + " user(s).");
process.exit(0);
