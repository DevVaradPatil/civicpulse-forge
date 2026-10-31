import { NextResponse } from "next/server";
import { geminiReady } from "@/lib/server/gemini";
import { transcribeAudio, sarvamReady, languageName, SarvamError } from "@/lib/server/sarvam";
import { triageImage, triageTranscript } from "@/lib/agents/triage";
import { CATEGORIES, type IssueCategory } from "@/lib/domain";

export const runtime = "nodejs";
// A spoken report is two upstream calls: Sarvam to transcribe, then Gemini to triage.
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!geminiReady()) {
    return NextResponse.json(
      { error: "AI triage is not configured (missing GEMINI_API_KEY)." },
      { status: 503 },
    );
  }

  let body: {
    imageBase64?: string;
    audioBase64?: string;
    mimeType?: string;
    categoryHint?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const hintOf = (v?: string) =>
    v && v in CATEGORIES ? (v as IssueCategory) : undefined;

  // ---- spoken report: Sarvam transcribes, then the same triage runs on the text
  if (body.audioBase64) {
    if (!sarvamReady()) {
      return NextResponse.json(
        { error: "Voice reports are not configured (missing SARVAM_API_KEY)." },
        { status: 503 },
      );
    }
    const audio = body.audioBase64.match(/^data:(.+?);base64,(.*)$/s);
    const audioMime = audio?.[1] ?? body.mimeType ?? "audio/webm";
    const audioData = audio?.[2] ?? body.audioBase64;
    const buffer = Buffer.from(audioData, "base64");
    if (buffer.length === 0) {
      return NextResponse.json({ error: "The recording was empty." }, { status: 400 });
    }

    try {
      const heard = await transcribeAudio(buffer, audioMime);
      const language = languageName(heard.languageCode);
      const triage = await triageTranscript(heard.transcript, language, hintOf(body.categoryHint));
      return NextResponse.json({
        ...triage,
        transcript: heard.transcript,
        languageCode: heard.languageCode,
        language,
      });
    } catch (err) {
      if (err instanceof SarvamError) {
        // Already phrased for a citizen to read.
        return NextResponse.json({ error: err.message }, { status: err.status || 502 });
      }
      console.error("voice triage failed", err);
      return NextResponse.json(
        { error: "Could not process that recording. Please try again." },
        { status: 502 },
      );
    }
  }

  if (!body.imageBase64) {
    return NextResponse.json(
      { error: "imageBase64 or audioBase64 is required." },
      { status: 400 },
    );
  }

  // Accept data URLs or bare base64.
  const match = body.imageBase64.match(/^data:(.+?);base64,(.*)$/s);
  const mimeType = match?.[1] ?? body.mimeType ?? "image/jpeg";
  const data = match?.[2] ?? body.imageBase64;

  const hint = hintOf(body.categoryHint);

  try {
    const result = await triageImage(data, mimeType, hint);
    return NextResponse.json(result);
  } catch (err) {
    console.error("triage failed", err);
    return NextResponse.json({ error: "Triage failed. Please try again." }, { status: 502 });
  }
}
