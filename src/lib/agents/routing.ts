import "server-only";
import { Type } from "@google/genai";
import { generate, MODEL } from "@/lib/server/gemini";
import { CATEGORIES } from "@/lib/domain";
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

/** Routing agent — drafts a formal complaint to the responsible Delhi authority. */
export async function draftComplaint(issue: Issue): Promise<DraftedComplaint> {
  const department = CATEGORIES[issue.category].department;
  const prompt = `You are CivicPulse's routing agent. Draft a formal civic complaint that a citizen can send to the responsible authority.

Authority: ${department}
Issue: ${issue.title}
Category: ${CATEGORIES[issue.category].label}
Details: ${issue.description}
Severity: ${issue.severity}/5
Location: ${issue.lat.toFixed(5)}, ${issue.lng.toFixed(5)} (Delhi)
Citizen confirmations: ${issue.confirmations}

Write a polite, firm, professional complaint. Mention the exact location, the public-safety impact, and that multiple citizens have confirmed it. Set a priority and a realistic SLA. Return ONLY the structured JSON.`;

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
