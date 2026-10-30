import { NextResponse } from "next/server";
import { getOrDraftComplaint } from "@/lib/server/issues";
import { geminiReady } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!geminiReady()) {
    return NextResponse.json({ error: "AI not configured." }, { status: 503 });
  }
  const { id } = await params;
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  try {
    const complaint = await getOrDraftComplaint(id, force);
    if (!complaint) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    return NextResponse.json({ complaint });
  } catch (err) {
    console.error("complaint failed", err);
    return NextResponse.json({ error: "Could not draft complaint." }, { status: 502 });
  }
}
