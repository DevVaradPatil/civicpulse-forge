import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/server/auth";
import { ensureProfile, getUser } from "@/lib/server/users";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = await getUserFromRequest(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const profile =
    (await getUser(u.uid)) ?? {
      uid: u.uid,
      displayName: u.name ?? "Anonymous",
      points: 0,
      reportCount: 0,
      confirmCount: 0,
      resolveCount: 0,
    };
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const u = await getUserFromRequest(req);
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  await ensureProfile(u.uid, body.displayName ?? u.name, body.photoURL ?? u.picture);
  return NextResponse.json({ profile: await getUser(u.uid) });
}
