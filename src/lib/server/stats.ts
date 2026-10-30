import "server-only";
import { listIssues } from "@/lib/server/issues";
import { severityMeta, type IssueCategory, type IssueStatus } from "@/lib/domain";
import type { DashboardStats, Hotspot, Issue } from "@/lib/types";

const HOTSPOT_PRECISION = 6; // ~1.2km cells — roughly neighbourhood scale.
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function emptyStatus(): Record<IssueStatus, number> {
  return { reported: 0, verified: 0, in_progress: 0, resolved: 0 };
}
function emptyCategory(): Record<IssueCategory, number> {
  return { pothole: 0, water_leak: 0, streetlight: 0, waste: 0, other: 0 };
}

export function computeStats(issues: Issue[]): DashboardStats {
  const byStatus = emptyStatus();
  const byCategory = emptyCategory();
  const bySeverity = { low: 0, med: 0, high: 0, critical: 0 };
  let resolved = 0;
  let last7Days = 0;
  const now = Date.now();

  for (const i of issues) {
    byStatus[i.status]++;
    byCategory[i.category]++;
    const t = severityMeta(i.severity).token;
    if (t === "sev-critical") bySeverity.critical++;
    else if (t === "sev-high") bySeverity.high++;
    else if (t === "sev-med") bySeverity.med++;
    else bySeverity.low++;
    if (i.status === "resolved") resolved++;
    if (now - i.createdAt < SEVEN_DAYS) last7Days++;
  }

  // Daily report counts for the last 7 days (oldest → newest).
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const trend7 = Array.from({ length: 7 }, (_, idx) => {
    const dayStart = startOfToday.getTime() - (6 - idx) * dayMs;
    const count = issues.filter(
      (i) => i.createdAt >= dayStart && i.createdAt < dayStart + dayMs,
    ).length;
    const label = new Date(dayStart).toLocaleDateString("en-US", { weekday: "short" });
    return { label, count };
  });

  const total = issues.length;
  return {
    total,
    resolved,
    resolutionRate: total ? resolved / total : 0,
    byStatus,
    byCategory,
    bySeverity,
    last7Days,
    trend7,
  };
}

export function detectHotspots(issues: Issue[], limit = 5): Hotspot[] {
  const groups = new Map<string, Issue[]>();
  for (const i of issues) {
    if (!i.geohash) continue;
    const cell = i.geohash.slice(0, HOTSPOT_PRECISION);
    (groups.get(cell) ?? groups.set(cell, []).get(cell)!).push(i);
  }

  const hotspots: Hotspot[] = [];
  for (const [cell, items] of groups) {
    if (items.length < 2) continue; // recurring only
    const lat = items.reduce((s, i) => s + i.lat, 0) / items.length;
    const lng = items.reduce((s, i) => s + i.lng, 0) / items.length;
    const openCount = items.filter((i) => i.status !== "resolved").length;
    const catCount = new Map<IssueCategory, number>();
    for (const i of items) catCount.set(i.category, (catCount.get(i.category) ?? 0) + 1);
    const topCategory = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0][0];
    hotspots.push({ cell, lat, lng, count: items.length, openCount, topCategory });
  }

  return hotspots.sort((a, b) => b.count - a.count).slice(0, limit);
}

export async function getDashboard(): Promise<{
  stats: DashboardStats;
  hotspots: Hotspot[];
  issues: Issue[];
}> {
  const issues = await listIssues();
  return {
    stats: computeStats(issues),
    hotspots: detectHotspots(issues),
    issues,
  };
}
