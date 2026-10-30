import "server-only";
import { Type } from "@google/genai";
import { generate, MODEL } from "@/lib/server/gemini";
import { CATEGORIES, type IssueCategory } from "@/lib/domain";
import type { VerificationResult } from "@/lib/types";

export type { VerificationResult };

const schema = {
  type: Type.OBJECT,
  properties: {
    resolved: {
      type: Type.BOOLEAN,
      description: "True only if the AFTER photo clearly shows the issue is fixed.",
    },
    confidence: { type: Type.NUMBER, description: "0-1 confidence." },
    note: {
      type: Type.STRING,
      description: "One short sentence explaining the decision.",
    },
  },
  required: ["resolved", "confidence", "note"],
};

/** Resolution Verifier agent — multimodal before/after comparison closing the accountability loop. */
export async function verifyResolution(
  beforeBase64: string,
  beforeMime: string,
  afterBase64: string,
  afterMime: string,
  category: IssueCategory,
  title: string,
): Promise<VerificationResult> {
  const prompt = `You are CivicPulse's resolution verifier.
A citizen reported a "${CATEGORIES[category].label}" issue: "${title}".
You are given the BEFORE photo (original problem) and an AFTER photo claiming it is fixed.
Decide if the AFTER photo genuinely shows the same location/issue resolved.
Be strict: mark resolved=true only if the fix is clearly visible. If the photos are unrelated, blurry, or the problem persists, resolved=false.
Return ONLY the structured JSON.`;

  const res = await generate({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: "BEFORE photo:" },
          { inlineData: { mimeType: beforeMime, data: beforeBase64 } },
          { text: "AFTER photo:" },
          { inlineData: { mimeType: afterMime, data: afterBase64 } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.1,
    },
  });

  const raw = JSON.parse(res.text ?? "{}");
  return {
    resolved: Boolean(raw.resolved),
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0.5)),
    note: String(raw.note ?? "").slice(0, 200),
  };
}
