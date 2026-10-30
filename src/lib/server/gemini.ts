import "server-only";
import { GoogleGenAI } from "@google/genai";

// Gemini via Google AI Studio (free tier). Server-side only — key never reaches the client.
//
// The free tier caps requests *per model per day* (gemini-2.5-flash allows 20),
// and a single agent investigation spends several. One model is therefore not
// enough to survive a demo: each entry below has its own quota bucket, so when
// one is exhausted or overloaded the next takes over and the product keeps
// working. All four were checked to support function calling, which the
// investigation agent needs.
export const MODEL = "gemini-3.5-flash";

const FALLBACK_CHAIN = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

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

/** Out of quota or gone: this model will not work again today, so move on. */
const isExhausted = (m: string) => /429|RESOURCE_EXHAUSTED|quota/i.test(m);
const isGone = (m: string) => /404|not found|no longer available/i.test(m);
/** Temporary: worth one more try on the same model before moving on. */
const isTransient = (m: string) => /503|UNAVAILABLE|overload|high demand|500|internal/i.test(m);

/**
 * generateContent with per-model retry and cross-model fallback.
 *
 * `onModel` reports which model actually answered, so a caller can show it
 * rather than claiming a model that may not have been used.
 */
export async function generate(params: GenParams, onModel?: (model: string) => void) {
  const ai = getAI();
  const requested = typeof params.model === "string" ? params.model : MODEL;
  const chain = [requested, ...FALLBACK_CHAIN.filter((m) => m !== requested)];

  let lastErr: unknown;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await ai.models.generateContent({ ...params, model });
        onModel?.(model);
        return res;
      } catch (e) {
        lastErr = e;
        const msg = String(e instanceof Error ? e.message : e);

        if (isExhausted(msg) || isGone(msg)) break; // next model, no point retrying
        if (isTransient(msg) && attempt === 0) {
          await new Promise((r) => setTimeout(r, 900));
          continue; // one more go at this model
        }
        if (isTransient(msg)) break; // still failing — next model
        throw e; // a real error (bad request, bad key): surface it
      }
    }
    if (model !== chain[chain.length - 1]) {
      console.warn(`gemini: ${model} unavailable, falling back`);
    }
  }
  throw lastErr;
}
