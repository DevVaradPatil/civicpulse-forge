import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/server/stats";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { stats, hotspots, agencies, wards, provenance } = await getDashboard();
    return NextResponse.json({ stats, hotspots, agencies, wards, provenance });
  } catch (err) {
    console.error("dashboard failed", err);
    return NextResponse.json({ error: "Could not load dashboard." }, { status: 500 });
  }
}
