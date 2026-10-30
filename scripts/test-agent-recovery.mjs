// Verifies the investigation agent recovers from a tool error.
//
//   node --import ./scripts/node-loader.mjs --env-file=.env.local scripts/test-agent-recovery.mjs
//
// Feeds the agent an issue whose ward name is misspelled. get_ward_stats will
// reject it and return did_you_mean; a working loop reads that and retries with
// the corrected name instead of giving up or inventing a figure.
import assert from "node:assert/strict";
import { investigateIssue } from "../src/lib/agents/investigate.ts";

const issue = {
  id: "recovery-test",
  title: "Large pothole near the bus stop causing two-wheeler falls",
  description: "Deep pothole on the main road, worsens after rain.",
  category: "pothole",
  severity: null,
  hazards: [],
  status: "reported",
  lat: 12.9268,
  lng: 77.6762,
  geohash: "",
  photoPath: null,
  confirmations: 0,
  // Deliberately misspelled: the real ward is "Bellanduru".
  ward: "Bellandur",
  agency: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

console.log("Running the agent with a misspelled ward ('Bellandur')…\n");
const out = await investigateIssue(issue);

for (const t of out.trace) {
  console.log(`  ${t.step}. [${t.ok ? "ok " : "ERR"}] ${t.tool}(${JSON.stringify(t.args)})`);
  console.log(`         ${t.summary}`);
}

const wardCalls = out.trace.filter((t) => t.tool === "get_ward_stats");
const failed = wardCalls.filter((t) => !t.ok);
const succeeded = wardCalls.filter((t) => t.ok);

console.log("\n--- assertions ---");

assert.ok(wardCalls.length > 0, "the agent should have tried get_ward_stats");
console.log("  ok   the agent called get_ward_stats");

if (failed.length === 0) {
  // The model sometimes corrects the spelling before ever calling the tool.
  // That is also a pass: what must never happen is an uncorrected failure.
  console.log("  note the agent spelled the ward correctly without needing the error");
} else {
  assert.ok(
    succeeded.length > 0,
    "after a rejected ward the agent must retry with a corrected name, not give up",
  );
  console.log(`  ok   recovered after ${failed.length} rejected call(s)`);
}

assert.ok(
  out.trace.every((t) => t.durationMs >= 0),
  "every trace entry needs a duration",
);
console.log("  ok   every tool call is recorded in the trace");

// No finding may cite a tool that was never called.
const called = new Set(out.trace.map((t) => t.tool));
for (const f of out.findings) {
  const tool = String(f.source).split("(")[0].trim();
  if (tool) {
    assert.ok(
      called.has(tool),
      `finding cites ${tool}, which the agent never called: ${f.claim}`,
    );
  }
}
console.log(`  ok   all ${out.findings.length} findings cite tools that actually ran`);

assert.ok(out.summary.length > 0, "expected a summary");
assert.ok(out.complaint.body.length > 0, "expected a drafted complaint");
console.log("  ok   produced a summary and a complaint");
console.log("  model used:", out.model);

// ---- scenario 2: a ward name nothing can be matched to ----
// The agent cannot correct its way out of this one, so the tool must return an
// error and the agent must carry on without inventing ward figures.
console.log("\nRunning with an unmatchable ward ('Zzqq Nagar')…\n");
const out2 = await investigateIssue({
  ...issue,
  id: "recovery-test-2",
  ward: "Zzqq Nagar",
});

for (const t of out2.trace) {
  console.log(`  ${t.step}. [${t.ok ? "ok " : "ERR"}] ${t.tool}(${JSON.stringify(t.args)})`);
  console.log(`         ${t.summary}`);
}

console.log("\n--- assertions ---");
const ward2 = out2.trace.filter((t) => t.tool === "get_ward_stats");
const failedWard = ward2.filter((t) => !t.ok).map((t) => String(t.args.ward));

if (failedWard.length) {
  console.log(`  ok   the tool rejected ${failedWard.join(", ")} instead of inventing figures`);
  // Whatever it did next, it must not have given up entirely.
  assert.ok(
    out2.trace.length > failedWard.length,
    "after a rejected call the agent should still gather other evidence",
  );
  console.log("  ok   the agent continued with other tools after the rejection");
} else {
  console.log("  note the agent avoided the bad ward name rather than calling the tool");
}

assert.ok(out2.summary.length > 0, "the agent must still produce a report");
const called2 = new Set(out2.trace.filter((t) => t.ok).map((t) => t.tool));
for (const f of out2.findings) {
  const tool = String(f.source).split("(")[0].trim();
  if (tool) {
    assert.ok(
      called2.has(tool),
      `finding cites ${tool}, which never returned successfully: ${f.claim}`,
    );
  }
}
console.log("  ok   no finding cites a tool call that failed or never ran");
assert.ok(
  !/Zzqq/i.test(JSON.stringify(out2.findings)),
  "no finding should present the unmatchable ward as real data",
);
console.log("  ok   the unmatchable ward is not reported as a real locality");

console.log("\npassed");
