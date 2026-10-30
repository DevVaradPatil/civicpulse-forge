import "server-only";
import { Type } from "@google/genai";
import { generate, MODEL } from "@/lib/server/gemini";
import type { IssueCategory } from "@/lib/domain";
import type { TriageResult } from "@/lib/types";

const CATEGORIES: IssueCategory[] = [
  "pothole",
  "water_leak",
  "streetlight",
  "waste",
  "other",
];

const schema = {
  type: Type.OBJECT,
  properties: {
    isCivicIssue: {
      type: Type.BOOLEAN,
      description: "True only if the photo shows a genuine public civic/infrastructure problem.",
    },
    category: { type: Type.STRING, enum: CATEGORIES },
    severity: {
      type: Type.INTEGER,
      description: "1 = cosmetic/minor, 5 = dangerous/urgent public hazard.",
    },
    title: { type: Type.STRING, description: "Short headline, max 8 words." },
    description: {
      type: Type.STRING,
      description: "1-2 sentence factual description of what is wrong.",
    },
    hazards: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Concrete safety risks, e.g. 'risk to two-wheelers'. Empty if none.",
    },
    confidence: { type: Type.NUMBER, description: "0-1 confidence in this assessment." },
  },
  required: [
    "isCivicIssue",
    "category",
    "severity",
    "title",
    "description",
    "hazards",
    "confidence",
  ],
};

const BASE_PROMPT = `You are CivicPulse's triage agent for civic issues reported by citizens in Delhi, India.
Analyze the attached photo of a reported public problem.

Rules:
- Decide if it is a genuine civic/public-infrastructure issue (pothole/road damage, water leak/waterlogging, streetlight, waste/garbage, or other public problem). Selfies, indoor/private scenes, or unrelated images => isCivicIssue=false.
- Pick the single best category.
- Rate severity 1-5 based on public safety and disruption (5 = immediate danger to people/vehicles).
- Write a short factual title and a 1-2 sentence description. Do not invent details you cannot see.
- List concrete hazards if any.
Return ONLY the structured JSON.`;

function buildPrompt(hint?: IssueCategory): string {
  if (!hint || hint === "other") return BASE_PROMPT;
  return `${BASE_PROMPT}

The reporter pre-selected the category as "${hint}". Treat this as a strong hint and prefer it, unless the photo clearly shows a different category.`;
}

function clampSeverity(n: unknown): number {
  const v = Math.round(Number(n) || 1);
  return Math.min(5, Math.max(1, v));
}

/** Triage agent — multimodal Gemini call turning a photo into structured issue data. */
export async function triageImage(
  base64: string,
  mimeType: string,
  categoryHint?: IssueCategory,
): Promise<TriageResult> {
  const res = await generate({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: buildPrompt(categoryHint) },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.2,
    },
  });

  const raw = JSON.parse(res.text ?? "{}");
  const category: IssueCategory = CATEGORIES.includes(raw.category)
    ? raw.category
    : "other";

  return {
    isCivicIssue: Boolean(raw.isCivicIssue),
    category,
    severity: clampSeverity(raw.severity),
    title: String(raw.title ?? "Reported civic issue").slice(0, 80),
    description: String(raw.description ?? "").slice(0, 400),
    hazards: Array.isArray(raw.hazards) ? raw.hazards.map(String).slice(0, 5) : [],
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
  };
}
