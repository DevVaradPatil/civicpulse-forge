// Self-check for the investigation agent's tools.
//
//   node --env-file=.env.local scripts/test-tools.mjs
//
// Asserts the two things the agent loop depends on: tools return real figures
// that reconcile with the database, and a bad argument comes back as a
// readable error with a hint instead of throwing — that recovery path is what
// the trace in the UI is meant to demonstrate.
import assert from "node:assert/strict";
import { runTool } from "../src/lib/agents/tools.ts";

let passed = 0;
const checks = [];
function check(name, fn) {
  checks.push([name, fn]);
}

// ---- error contracts: every bad input is reported, never thrown ----

check("unknown tool name is reported, not thrown", async () => {
  const r = await runTool("no_such_tool", {});
  assert.ok(r.error, "expected an error field");
  assert.ok(Array.isArray(r.available_tools) && r.available_tools.length > 0);
});

check("unknown ward returns suggestions the agent can retry with", async () => {
  const r = await runTool("get_ward_stats", { ward: "Bellandur" }); // missing trailing u
  assert.ok(r.error, "expected an error for a misspelled ward");
  assert.ok(Array.isArray(r.did_you_mean), "expected did_you_mean");
  assert.ok(
    r.did_you_mean.includes("Bellanduru"),
    `expected Bellanduru in suggestions, got ${JSON.stringify(r.did_you_mean)}`,
  );
  assert.ok(r.hint, "expected a hint");
});

check("unknown agency lists the real ones", async () => {
  const r = await runTool("get_agency_performance", { agency: "NOPE" });
  assert.ok(r.error);
  assert.ok(r.known_agencies.includes("BBMP"));
});

check("unknown category lists valid ones", async () => {
  const r = await runTool("get_category_routing", { category: "banana" });
  assert.ok(r.error);
  assert.ok(r.valid_categories.includes("pothole"));
});

check("missing coordinates are rejected cleanly", async () => {
  const r = await runTool("search_similar_grievances", { lat: "abc" });
  assert.ok(r.error);
});

// ---- real data: figures must reconcile ----

check("ward stats are internally consistent", async () => {
  const r = await runTool("get_ward_stats", { ward: "Bellanduru" });
  assert.ok(!r.error, `unexpected error: ${r.error}`);
  assert.ok(r.total > 0, "expected a positive record count");
  assert.ok(r.resolved + r.open <= r.total, "resolved+open cannot exceed total");
  const expected = Math.round((r.resolved / (r.resolved + r.open)) * 100);
  assert.equal(r.resolution_rate_pct, expected, "resolution rate must match its parts");
  assert.ok(r.volume_rank >= 1 && r.volume_rank <= r.of_wards);
});

check("the catch-all ward is flagged as not a place", async () => {
  const r = await runTool("get_ward_stats", { ward: "Other" });
  assert.ok(!r.error);
  assert.match(String(r.note), /catch-all/i, "expected the catch-all to be called out");
});

check("agency performance excludes rejected/closed from the rate", async () => {
  const r = await runTool("get_agency_performance", { agency: "BBMP" });
  assert.ok(!r.error);
  const expected = Math.round((r.resolved / (r.resolved + r.open)) * 100);
  assert.equal(r.resolution_rate_pct, expected);
  assert.equal(r.full_name, "Bruhat Bengaluru Mahanagara Palike");
});

check("agency aliases normalise to the acronym", async () => {
  const r = await runTool("get_agency_performance", {
    agency: "Bruhat Bengaluru Mahanagara Palike",
  });
  assert.ok(!r.error, "the dataset's long form should resolve");
  assert.equal(r.agency, "BBMP");
});

check("routing is derived from real record counts", async () => {
  const r = await runTool("get_category_routing", { category: "pothole" });
  assert.ok(!r.error);
  assert.equal(r.agency, "BBMP");
  assert.ok(r.backed_by_records > 0, "routing must be backed by records");
  assert.ok(r.backed_by_records <= r.of_category_records_with_an_agency);
});

check("nearby search stays inside its radius", async () => {
  const r = await runTool("search_similar_grievances", {
    lat: 12.9121689,
    lng: 77.6662551,
    radius_km: 1,
  });
  assert.ok(!r.error);
  assert.ok(r.matches > 0, "expected records near a busy ward");
  assert.equal(r.resolved + r.open <= r.matches, true);
  for (const c of r.closest) {
    assert.ok(c.metres_away <= 1000, `${c.metres_away}m is outside the 1km radius`);
    assert.ok(c.source_url, "every cited record needs a verifiable source_url");
  }
});

check("a radius over open sea returns zero, not an error", async () => {
  const r = await runTool("search_similar_grievances", { lat: 0, lng: 0, radius_km: 1 });
  assert.ok(!r.error, "an empty area is a valid answer");
  assert.equal(r.matches, 0);
});

const failures = [];
for (const [name, fn] of checks) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}\n       ${err.message}`);
    failures.push(name);
  }
}

console.log(`\n${passed}/${checks.length} passed`);
process.exit(failures.length ? 1 : 0);
