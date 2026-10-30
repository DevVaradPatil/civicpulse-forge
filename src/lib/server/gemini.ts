import "server-only";
import { GoogleGenAI } from "@google/genai";

// Gemini via Google AI Studio (free tier). Server-side only — key never reaches the client.
// gemini-2.0-flash is zeroed on the free tier; 2.5-flash has live free quota and is multimodal.
export const MODEL = "gemini-2.5-flash";

let client: GoogleGenAI | null = null;

/** Lazily constructs the client so build/static analysis doesn't warn about a missing key. */
export function getAI(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
  }
  return client;
}

export function geminiReady(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

type GenParams = Parameters<GoogleGenAI["models"]["generateContent"]>[0];

/** generateContent with retry/backoff for transient 503 (overload) / 429 (rate) errors. */
export async function generate(params: GenParams) {
  const ai = getAI();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (e) {
      lastErr = e;
      const msg = String(e instanceof Error ? e.message : e);
      const retriable =
        /503|UNAVAILABLE|overload|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
      if (!retriable || attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 900 * (attempt + 1)));
    }
  }
  throw lastErr;
}
