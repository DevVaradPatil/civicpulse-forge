import "server-only";
import { Type } from "@google/genai";
import { generate, MODEL } from "@/lib/server/gemini";
import { CATEGORIES, agencyLabel } from "@/lib/domain";
import { resolveAgency } from "@/lib/server/agencies";
import type { Issue } from "@/lib/types";

export interface DraftedComplaint {
  subject: string;
  body: string;
  priority: string;
  slaEstimate: string;
}

const schema = {
  type: Type.OBJECT,
  properties: {
    subject: { type: Type.STRING, description: "Email/letter subject line." },
    body: {
      type: Type.STRING,
      description:
        "Formal complaint body addressed to the department, ready to send. Reference location, severity and citizen confirmations. 120-180 words.",
    },
    priority: { type: Type.STRING, enum: ["Low", "Medium", "High", "Urgent"] },
    slaEstimate: {
      type: Type.STRING,
      description: "Reasonable expected resolution window, e.g. '7-10 days'.",
    },
  },
  required: ["subject", "body", "priority", "slaEstimate"],
};

/**
 * Routing agent — drafts a formal complaint to the responsible Bengaluru
 * agency. The agency is passed in already resolved from real data (the record's
 * own `civic_agency_title`, or the agency that handles this category across the
 * real grievance dataset), so the model is never asked to guess who is
 * responsible. Facts the record does not carry are omitted from the prompt
 * rather than filled in.
 */
export async function draftComplaint(issue: Issue): Promise<DraftedComplaint> {
  const { agency, basis, count } = await resolveAgency(issue);
  const authority = agency
    ? `${agencyLabel(agency)}${
        basis === "derived" ? ` (handles ${count} recorded grievances in this category)` : ""
      }`
    : "the responsible municipal authority (not yet identified from the record)";

  const facts = [
    `Authority: ${authority}`,
    `Issue: ${issue.title}`,
    `Category: ${CATEGORIES[issue.category].label}`,
    issue.description ? `Details: ${issue.description}` : null,
    issue.severity != null ? `AI severity assessment: ${issue.severity}/5` : null,
    issue.ward ? `Ward: ${issue.ward}` : null,
    `Location: ${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)} (Bengaluru)`,
    issue.confirmations > 0 ? `Citizen confirmations: ${issue.confirmations}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are CivicPulse's routing agent. Draft a formal civic complaint that a citizen can send to the responsible authority.

${facts}

Write a polite, firm, professional complaint. Mention the exact location and the public-safety impact. Use ONLY the facts listed above — do not invent severity, dates, confirmation counts, case numbers or any detail not given. If a detail is absent, leave it out. Set a priority and a realistic SLA. Return ONLY the structured JSON.`;

  const res = await generate({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.3,
    },
  });

  const raw = JSON.parse(res.text ?? "{}");
  return {
    subject: String(raw.subject ?? `Civic issue: ${issue.title}`).slice(0, 160),
    body: String(raw.body ?? "").slice(0, 1500),
    priority: ["Low", "Medium", "High", "Urgent"].includes(raw.priority)
      ? raw.priority
      : "Medium",
    slaEstimate: String(raw.slaEstimate ?? "7-10 days").slice(0, 40),
  };
}
