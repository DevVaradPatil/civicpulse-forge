import { NextResponse } from "next/server";
import { setInProgress } from "@/lib/server/issues";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const issue = await setInProgress(id);
    if (!issue) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    return NextResponse.json({ issue });
  } catch (err) {
    console.error("progress failed", err);
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}
