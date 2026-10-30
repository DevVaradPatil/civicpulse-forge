import { NextResponse } from "next/server";
import { getInsights } from "@/lib/server/insights";
import { geminiReady } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get("refresh") === "1";
  if (force && !geminiReady()) {
    return NextResponse.json({ error: "AI not configured." }, { status: 503 });
  }
  try {
    const insights = await getInsights(force);
    return NextResponse.json(insights);
  } catch (err) {
    console.error("insights failed", err);
    return NextResponse.json({ error: "Could not load insights." }, { status: 500 });
  }
}
