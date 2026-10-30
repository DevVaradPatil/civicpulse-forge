import { NextResponse } from "next/server";
import { confirmIssue } from "@/lib/server/issues";
import { awardPoints } from "@/lib/server/users";
import { getUserFromRequest } from "@/lib/server/auth";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const authed = await getUserFromRequest(req);
  const uid: string | undefined = authed?.uid ?? body.uid;
  const name: string | undefined = body.name ?? authed?.name;

  try {
    const result = await confirmIssue(id, uid);
    if (!result) return NextResponse.json({ error: "Issue not found." }, { status: 404 });
    if (result.counted) await awardPoints(uid, name, "confirm");
    return NextResponse.json(result);
  } catch (err) {
    console.error("confirm failed", err);
    return NextResponse.json({ error: "Could not confirm." }, { status: 500 });
  }
}
