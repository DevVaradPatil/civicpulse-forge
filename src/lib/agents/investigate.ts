import "server-only";
import { Type, type Content } from "@google/genai";
import { generate, MODEL } from "@/lib/server/gemini";
import { TOOL_DECLARATIONS, runTool, type ToolResult } from "@/lib/agents/tools";
import { CATEGORIES, agencyLabel } from "@/lib/domain";
import type { Investigation, Issue, ToolCallTrace } from "@/lib/types";

/**
 * The investigation agent.
 *
 * Unlike the one-shot triage/routing calls, this plans and executes across
 * several turns: it decides which tools to call, reads their results, recovers
 * when a tool rejects its arguments, and only then writes its findings. Every
 * call is recorded in a trace that the UI renders, so the reasoning is
 * inspectable rather than asserted.
 *
 * Grounding is enforced structurally: the agent has no numbers except the ones
 * tools return, and the synthesis step is told to cite tool output for each
 * finding or drop the finding.
 */

const MAX_ROUNDS = 5;
/** Belt-and-braces cap: a loop that keeps calling tools must still terminate. */
const MAX_TOOL_CALLS = 8;

const reportSchema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "2-3 sentences on what the evidence shows about this issue and its location.",
    },
    findings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          claim: { type: Type.STRING, description: "One specific finding, with its number." },
          source: {
            type: Type.STRING,
            description: "The tool that produced it, e.g. 'get_ward_stats(Bellanduru)'.",
          },
        },
        required: ["claim", "source"],
      },
      description: "2-5 findings. Every one must come from a tool result.",
    },
    recommendedAgency: {
      type: Type.STRING,
      description: "Agency acronym from get_category_routing, or empty if none could be derived.",
    },
    priority: { type: Type.STRING, enum: ["Low", "Medium", "High", "Urgent"] },
    complaint: {
      type: Type.OBJECT,
      properties: {
        subject: { type: Type.STRING, description: "Subject line for the complaint." },
        body: {
          type: Type.STRING,
          description:
            "Formal complaint to the agency, 120-180 words, using only established facts.",
        },
      },
      required: ["subject", "body"],
    },
  },
  required: ["summary", "findings", "recommendedAgency", "priority", "complaint"],
};

function briefFor(issue: Issue): string {
  const facts = [
    `Title: ${issue.title}`,
    issue.description ? `Description: ${issue.description}` : null,
    `Category: ${issue.category} (${CATEGORIES[issue.category].label})`,
    `Status: ${issue.status}`,
    `Coordinates: ${issue.lat}, ${issue.lng}`,
    issue.ward ? `Ward recorded on the issue: ${issue.ward}` : null,
    issue.agency ? `Agency recorded on the issue: ${issue.agency}` : null,
    issue.severity != null ? `AI severity: ${issue.severity}/5` : "AI severity: none recorded",
    issue.confirmations > 0 ? `Citizen confirmations: ${issue.confirmations}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `Investigate this civic issue in Bengaluru and build an evidence-backed case for the responsible agency.

ISSUE
${facts}

HOW TO WORK
- Use the tools to gather evidence before concluding anything. A good investigation checks the surrounding area, the ward, the routing target, and that agency's track record.
- You have no figures other than what the tools return. Never state a number a tool did not give you.
- If a tool returns an "error" field, read its "hint" and "did_you_mean"/"valid_categories" and retry with corrected arguments. Do not repeat the same failing call.
- Stop calling tools once you have enough to justify a routing decision and a complaint.`;
}

/** Short human-readable gist of a tool result, for the trace shown in the UI. */
function summarise(name: string, result: ToolResult): string {
  if (result.error) return String(result.error);
  switch (name) {
    case "search_similar_grievances":
      return result.matches === 0
        ? `No records within ${result.radius_km}km`
        : `${result.matches} records within ${result.radius_km}km · ${result.resolved} resolved, ${result.open} open`;
    case "get_ward_stats":
      return result.resolution_rate_pct == null
        ? `${result.ward}: ${result.total} records`
        : `${result.ward}: ${result.total} records, ${result.resolution_rate_pct}% resolved (rank ${result.volume_rank}/${result.of_wards})`;
    case "get_agency_performance":
      return `${result.agency}: ${result.total} records, ${result.resolution_rate_pct}% resolved`;
    case "get_category_routing":
      return result.agency
        ? `${result.category} → ${result.agency} (${result.backed_by_records} records)`
        : `${result.category} → no agency in the data`;
    default:
      return "ok";
  }
}

export async function investigateIssue(issue: Issue): Promise<Investigation> {
  const started = Date.now();
  const trace: ToolCallTrace[] = [];
  const contents: Content[] = [{ role: "user", parts: [{ text: briefFor(issue) }] }];
  let toolCalls = 0;
  // Which model actually answered — generate() falls back when one is out of
  // free-tier quota, so this must be reported rather than assumed.
  let modelUsed = MODEL;
  const noteModel = (m: string) => {
    modelUsed = m;
  };

  // ---- phase 1: let the agent plan and gather evidence with tools ----
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await generate({
      model: MODEL,
      contents,
      config: {
        tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        temperature: 0.2,
      },
    }, noteModel);

    const calls = res.functionCalls ?? [];
    if (calls.length === 0) break; // the agent is satisfied

    // Echo back the model's own content rather than rebuilding it. Gemini 3.x
    // attaches a thought_signature to each functionCall part and rejects the
    // next turn if it is missing, so the parts must be passed through intact.
    const modelContent = res.candidates?.[0]?.content;
    contents.push(
      modelContent?.parts?.length
        ? modelContent
        : {
            role: "model",
            parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
          },
    );

    const responses = [];
    for (const call of calls) {
      if (toolCalls >= MAX_TOOL_CALLS) break;
      toolCalls++;
      const name = call.name ?? "";
      const args = (call.args ?? {}) as ToolResult;
      const t0 = Date.now();
      const result = await runTool(name, args);
      trace.push({
        step: trace.length + 1,
        tool: name,
        args,
        ok: !result.error,
        summary: summarise(name, result),
        durationMs: Date.now() - t0,
      });
      responses.push({ functionResponse: { name, response: result } });
    }

    contents.push({ role: "user", parts: responses });
    if (toolCalls >= MAX_TOOL_CALLS) break;
  }

  // ---- phase 2: synthesise, with no tools so the output can be structured ----
  contents.push({
    role: "user",
    parts: [
      {
        text: `Now write the investigation report as JSON matching the schema.

Rules:
- Every finding must be traceable to a tool result above; put the tool call in "source".
- Use only numbers the tools returned. If you have none for a point, leave that point out.
- recommendedAgency must be the acronym get_category_routing gave, or the agency recorded on the issue. If neither exists, return an empty string.
- The complaint must not invent case numbers, dates, deadlines or severity.`,
      },
    ],
  });

  const final = await generate({
    model: MODEL,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: reportSchema,
      temperature: 0.3,
    },
  }, noteModel);

  const raw = JSON.parse(final.text ?? "{}");
  const findings = Array.isArray(raw.findings)
    ? raw.findings
        .filter((f: unknown) => f && typeof (f as { claim?: string }).claim === "string")
        .slice(0, 6)
        .map((f: { claim: string; source?: string }) => ({
          claim: String(f.claim).slice(0, 400),
          source: String(f.source ?? "").slice(0, 160),
        }))
    : [];

  const agency = String(raw.recommendedAgency ?? "").trim() || null;

  return {
    summary: String(raw.summary ?? "").slice(0, 1200),
    findings,
    recommendedAgency: agency,
    recommendedAgencyLabel: agency ? agencyLabel(agency) : null,
    priority: ["Low", "Medium", "High", "Urgent"].includes(raw.priority) ? raw.priority : "Medium",
    complaint: {
      subject: String(raw.complaint?.subject ?? `Civic issue: ${issue.title}`).slice(0, 160),
      body: String(raw.complaint?.body ?? "").slice(0, 2000),
    },
    trace,
    toolCalls: trace.length,
    model: modelUsed,
    durationMs: Date.now() - started,
    generatedAt: Date.now(),
  };
}
