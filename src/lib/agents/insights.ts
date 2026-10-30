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
        `- cell ${h.cell} (~${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}): ${h.count} issues, ${h.openCount} open, mostly ${CATEGORIES[h.topCategory].label}`,
    )
    .join("\n");

  const prompt = `You are CivicPulse's insights analyst for civic issues in Delhi, India.
Given the aggregated data below, write:
1) a concise 2-3 sentence "summary" of the current situation, and
2) 3-5 short "predictions": specific predictive or actionable insights. Where relevant, factor in Delhi context (monsoon waterlogging, traffic, winter, festival waste). Reference hotspot areas and categories. Keep each prediction under 25 words.

DATA (JSON):
${JSON.stringify(
  {
    total: stats.total,
    resolved: stats.resolved,
    resolutionRatePct: Math.round(stats.resolutionRate * 100),
    byStatus: stats.byStatus,
    byCategory: stats.byCategory,
    bySeverity: stats.bySeverity,
    last7Days: stats.last7Days,
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
