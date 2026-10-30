import { NextResponse } from "next/server";
import { wardChoropleth } from "@/lib/server/stats";

export const runtime = "nodejs";

/** Ward stats keyed by ward_id, for shading the BBMP boundary polygons. */
export async function GET() {
  try {
    const wards = await wardChoropleth();
    return NextResponse.json({ wards });
  } catch (err) {
    console.error("ward choropleth failed", err);
    return NextResponse.json({ error: "Could not load ward statistics." }, { status: 500 });
  }
}
