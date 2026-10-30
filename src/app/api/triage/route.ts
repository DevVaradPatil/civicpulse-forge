import { NextResponse } from "next/server";
import { geminiReady } from "@/lib/server/gemini";
import { triageImage } from "@/lib/agents/triage";
import { CATEGORIES, type IssueCategory } from "@/lib/domain";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!geminiReady()) {
    return NextResponse.json(
      { error: "AI triage is not configured (missing GEMINI_API_KEY)." },
      { status: 503 },
    );
  }

  let body: { imageBase64?: string; mimeType?: string; categoryHint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.imageBase64) {
    return NextResponse.json({ error: "imageBase64 is required." }, { status: 400 });
  }

  // Accept data URLs or bare base64.
  const match = body.imageBase64.match(/^data:(.+?);base64,(.*)$/s);
  const mimeType = match?.[1] ?? body.mimeType ?? "image/jpeg";
  const data = match?.[2] ?? body.imageBase64;

  const hint =
    body.categoryHint && body.categoryHint in CATEGORIES
      ? (body.categoryHint as IssueCategory)
      : undefined;

  try {
    const result = await triageImage(data, mimeType, hint);
    return NextResponse.json(result);
  } catch (err) {
    console.error("triage failed", err);
    return NextResponse.json({ error: "Triage failed. Please try again." }, { status: 502 });
  }
}
