import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/users";
import { listIssuesByReporter } from "@/lib/server/issues";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid } = await params;
  try {
    const [profile, reports] = await Promise.all([
      getUser(uid),
      listIssuesByReporter(uid),
    ]);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ profile, reports });
  } catch (err) {
    console.error("user profile failed", err);
    return NextResponse.json({ error: "Could not load profile." }, { status: 500 });
  }
}
