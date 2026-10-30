import "server-only";
import { Type } from "@google/genai";
import { generate, MODEL } from "@/lib/server/gemini";
import { CATEGORIES } from "@/lib/domain";
import type { DashboardStats, Hotspot } from "@/lib/types";

export interface GeneratedInsights {
  summary: string;
  predictions: string[];
}

const schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "2-3 sentence overview of the civic-issue situation.",
    },
    predictions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-5 short, specific, predictive or actionable insights.",
    },
  },
  required: ["summary", "predictions"],
};

/** Insights agent — turns aggregates + hotspots into a natural-language summary + predictions. */
export async function generateInsights(
  stats: DashboardStats,
  hotspots: Hotspot[],
): Promise<GeneratedInsights> {
  const hotspotLines = hotspots
    .map(
      (h) =>
        `- ${h.ward ? `${h.ward} ward` : "an unnamed area"} (~${h.lat.toFixed(3)}, ${h.lng.toFixed(
          3,
        )}): ${h.count} records, ${h.openCount} open, mostly ${CATEGORIES[h.topCategory].label}`,
    )
    .join("\n");

  const window =
    stats.window.start && stats.window.end
      ? `${new Date(stats.window.start).toISOString().slice(0, 10)} to ${new Date(
          stats.window.end,
        )
          .toISOString()
          .slice(0, 10)}`
      : "unknown";

  const prompt = `You are CivicPulse's insights analyst for civic grievances in Bengaluru, India.
Given the aggregated data below, write:
1) a concise 2-3 sentence "summary" of the situation these records describe, and
2) 3-5 short "predictions": specific predictive or actionable insights. Where relevant, factor in Bengaluru context (monsoon waterlogging, lake froth/encroachment, traffic density, solid-waste collection). Reference hotspot areas and categories. Keep each prediction under 25 words.

GROUNDING RULES — these matter more than style:
- Use ONLY the numbers given below. Never state a figure that is not here, and never round a count into a different number.
- The records span ${window}. Do not describe them as current, live or "this week", and do not imply a trend beyond that span.
- "unrated" records have no AI severity score. Do not infer severity for them.
- Rejected and closed records are excluded from the resolution rate; do not recompute it.
- If the data does not support a prediction, give fewer predictions rather than inventing one.
- Refer to places by the ward names given under HOTSPOTS. Never print a geohash cell id or raw coordinates.

DATA (JSON):
${JSON.stringify(
  {
    recordWindow: window,
    total: stats.total,
    officialRecords: stats.officialRecords,
    citizenReports: stats.citizenReports,
    resolved: stats.resolved,
    open: stats.open,
    rejectedOrClosed: stats.undecided,
    resolutionRatePct: Math.round(stats.resolutionRate * 100),
    unratedForSeverity: stats.unrated,
    byStatus: stats.byStatus,
    byCategory: stats.byCategory,
    bySeverity: stats.bySeverity,
    monthlyVolume: stats.trend,
  },
  null,
  0,
)}

HOTSPOTS:
${hotspotLines || "none yet"}

Return ONLY the structured JSON.`;

  const res = await generate({
    model: MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.4,
    },
  });

  const raw = JSON.parse(res.text ?? "{}");
  return {
    summary: String(raw.summary ?? "").slice(0, 500),
    predictions: Array.isArray(raw.predictions)
      ? raw.predictions.map(String).slice(0, 6)
      : [],
  };
}
