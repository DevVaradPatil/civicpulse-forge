import "server-only";

/**
 * Sarvam AI speech-to-text (Saaras).
 *
 * Used instead of a general multimodal model for two reasons: it is built for
 * Indian languages, so a Bengaluru resident can report in Kannada, Hindi or
 * English and be understood; and it keeps audio off the Gemini quota, which is
 * capped per model per day and is already carrying the agent loop.
 *
 * Contract (docs.sarvam.ai, verified against the live API):
 *   POST https://api.sarvam.ai/speech-to-text
 *   header  api-subscription-key: <key>      (no Bearer prefix)
 *   body    multipart/form-data, audio in a field literally named "file"
 *   returns { request_id, transcript, language_code, language_probability? }
 */

const ENDPOINT = "https://api.sarvam.ai/speech-to-text";
const MODEL = "saaras:v4";
/** The synchronous endpoint rejects anything longer. Enforced in the UI too. */
export const MAX_AUDIO_SECONDS = 30;

export function sarvamReady(): boolean {
  return Boolean(process.env.SARVAM_API_KEY);
}

export interface Transcription {
  transcript: string;
  /** BCP-47 as Sarvam reports it, e.g. "kn-IN". Null when it could not tell. */
  languageCode: string | null;
  /** Sarvam's own confidence in the detected language, when it gives one. */
  languageProbability: number | null;
  requestId: string | null;
}

/** Thrown with a message already safe to show a citizen. */
export class SarvamError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

function describe(status: number, body: string): SarvamError {
  // Sarvam returns { error: { message, code, request_id } }.
  let code = "";
  try {
    code = String(JSON.parse(body)?.error?.code ?? "");
  } catch {
    /* body was not JSON */
  }
  switch (status) {
    case 403:
      return new SarvamError("Speech transcription is not configured correctly.", status, false);
    case 402:
      return new SarvamError(
        "The speech service has run out of credits. Type the report instead.",
        status,
        false,
      );
    case 422:
      return new SarvamError(
        `That recording could not be read — it may be longer than ${MAX_AUDIO_SECONDS} seconds or in an unsupported format.`,
        status,
        false,
      );
    case 429:
      return new SarvamError("The speech service is busy. Try again in a moment.", status, true);
    default:
      if (status >= 500) {
        return new SarvamError("The speech service is unavailable. Try again.", status, true);
      }
      return new SarvamError(
        `Transcription failed${code ? ` (${code})` : ""}.`,
        status,
        false,
      );
  }
}

/**
 * Transcribes a recording in its own language. `transcribe` keeps the citizen's
 * own words rather than translating them — what they said is the record, and
 * the English summary is produced separately by the triage agent.
 */
export async function transcribeAudio(
  audio: Buffer,
  mimeType: string,
  attempt = 1,
): Promise<Transcription> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new SarvamError("Speech transcription is not configured.", 500, false);

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), fileNameFor(mimeType));
  form.append("model", MODEL);
  form.append("mode", "transcribe");
  // "unknown" is Sarvam's literal auto-detect value.
  form.append("language_code", "unknown");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "api-subscription-key": key },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    if (attempt < 3) return transcribeAudio(audio, mimeType, attempt + 1);
    throw new SarvamError("Could not reach the speech service.", 0, true);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = describe(res.status, body);
    if (err.retryable && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2 ** attempt * 600));
      return transcribeAudio(audio, mimeType, attempt + 1);
    }
    console.error(`sarvam ${res.status}: ${body.slice(0, 300)}`);
    throw err;
  }

  const json = (await res.json()) as {
    request_id?: string;
    transcript?: string;
    language_code?: string | null;
    language_probability?: number | null;
  };

  return {
    transcript: (json.transcript ?? "").trim(),
    languageCode: json.language_code ?? null,
    languageProbability:
      typeof json.language_probability === "number" ? json.language_probability : null,
    requestId: json.request_id ?? null,
  };
}

/** Sarvam sniffs the codec, but a sensible extension avoids any ambiguity. */
function fileNameFor(mimeType: string): string {
  const ext = mimeType.includes("webm")
    ? "webm"
    : mimeType.includes("mp4") || mimeType.includes("m4a")
      ? "m4a"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("mpeg") || mimeType.includes("mp3")
          ? "mp3"
          : "wav";
  return `report.${ext}`;
}

/** Human label for a BCP-47 code Sarvam returns. */
const LANGUAGE_NAMES: Record<string, string> = {
  "en-IN": "English",
  "hi-IN": "Hindi",
  "kn-IN": "Kannada",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  "ml-IN": "Malayalam",
  "mr-IN": "Marathi",
  "bn-IN": "Bengali",
  "gu-IN": "Gujarati",
  "pa-IN": "Punjabi",
  "od-IN": "Odia",
  "ur-IN": "Urdu",
  "as-IN": "Assamese",
  "ne-IN": "Nepali",
  "kok-IN": "Konkani",
  "sa-IN": "Sanskrit",
  "sd-IN": "Sindhi",
  "ks-IN": "Kashmiri",
  "mai-IN": "Maithili",
  "doi-IN": "Dogri",
  "brx-IN": "Bodo",
  "mni-IN": "Manipuri",
  "sat-IN": "Santali",
};

export function languageName(code: string | null | undefined): string | null {
  if (!code) return null;
  return LANGUAGE_NAMES[code] ?? code;
}
