import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase";
import { getDashboard } from "@/lib/server/stats";
import { generateInsights } from "@/lib/agents/insights";
import type { Insights } from "@/lib/types";

const KEY = "insights";
const TTL = 30 * 60 * 1000; // 30 min cache

/** Returns cached insights; regenerates via the agent when stale, forced, or missing. */
export async function getInsights(force = false): Promise<Insights> {
  if (!force) {
    const { data } = await supabaseAdmin.from("meta").select("value").eq("key", KEY).maybeSingle();
    const cached = data?.value as Insights | undefined;
    if (cached && Date.now() - cached.generatedAt < TTL) return cached;
  }

  const { stats, hotspots } = await getDashboard();

  // No data yet → skip the AI call (save free-tier quota).
  if (stats.total === 0) {
    return {
      summary: "No issues reported yet. Insights will appear once citizens start reporting.",
      predictions: [],
      generatedAt: Date.now(),
    };
  }

  const generated = await generateInsights(stats, hotspots);
  const insights: Insights = { ...generated, generatedAt: Date.now() };
  await supabaseAdmin.from("meta").upsert({ key: KEY, value: insights }, { onConflict: "key" });
  return insights;
}
