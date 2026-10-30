import { NextResponse } from "next/server";
import { wardChoropleth, wardSpend } from "@/lib/server/stats";

export const runtime = "nodejs";

/** Ward stats keyed by ward_id, for shading the BBMP boundary polygons. */
export async function GET() {
  try {
    // Spend is optional: if the work-order data is not loaded the panel is
    // simply absent rather than the request failing.
    const [wards, spend] = await Promise.all([wardChoropleth(), wardSpend()]);
    return NextResponse.json({ wards, spend });
  } catch (err) {
    console.error("ward choropleth failed", err);
    return NextResponse.json({ error: "Could not load ward statistics." }, { status: 500 });
  }
}
