import { NextResponse } from "next/server";
import { resolveIssue } from "@/lib/server/issues";
import { awardPoints } from "@/lib/server/users";
import { geminiReady } from "@/lib/server/gemini";
import { getUserFromRequest } from "@/lib/server/auth";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!geminiReady()) {
    return NextResponse.json(
      { error: "AI verification is not configured." },
      { status: 503 },
    );
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body.imageBase64) {
    return NextResponse.json({ error: "imageBase64 is required." }, { status: 400 });
  }

  try {
    const result = await resolveIssue(id, body.imageBase64, body.mimeType ?? "image/jpeg");
    if (!result) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    if (result.verification.resolved) {
      const authed = await getUserFromRequest(req);
      await awardPoints(authed?.uid ?? body.uid, body.name ?? authed?.name, "resolve");
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("resolve failed", err);
    return NextResponse.json({ error: "Verification failed. Try again." }, { status: 502 });
  }
}
