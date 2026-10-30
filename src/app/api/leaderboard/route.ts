import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/server/users";

export const runtime = "nodejs";

export async function GET() {
  try {
    const users = await getLeaderboard();
    return NextResponse.json({ users });
  } catch (err) {
    console.error("leaderboard failed", err);
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 500 });
  }
}
