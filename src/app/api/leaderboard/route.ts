import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/server/users";
import { computeStats } from "@/lib/server/stats";

export const runtime = "nodejs";

export async function GET() {
  try {
    // The city context comes along so an empty board can still say something
    // true about the work waiting, instead of rendering a blank panel.
    const [users, stats] = await Promise.all([
      getLeaderboard(),
      computeStats().catch(() => null),
    ]);
    return NextResponse.json({
      users,
      context: stats
        ? { open: stats.open, total: stats.total, resolutionRate: stats.resolutionRate }
        : null,
    });
  } catch (err) {
    console.error("leaderboard failed", err);
    return NextResponse.json({ error: "Could not load leaderboard." }, { status: 500 });
  }
}
