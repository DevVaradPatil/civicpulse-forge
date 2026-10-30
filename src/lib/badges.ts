// Community-hero tiers + achievement badges (derived from points/counts).
export interface Tier {
  name: string;
  min: number;
}

export const TIERS: Tier[] = [
  { name: "Civic Rookie", min: 0 },
  { name: "Active Citizen", min: 20 },
  { name: "Street Guardian", min: 50 },
  { name: "Community Hero", min: 100 },
];

export function tierFor(points: number): Tier {
  return [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0];
}

export function nextTier(points: number): Tier | null {
  return TIERS.find((t) => t.min > points) ?? null;
}

export interface Counts {
  reportCount: number;
  confirmCount: number;
  resolveCount: number;
}

export interface Badge {
  id: string;
  label: string;
  icon: string; // lucide icon name
}

export function badgesFor(c: Counts): Badge[] {
  const out: Badge[] = [];
  if (c.reportCount >= 1) out.push({ id: "first-report", label: "First Report", icon: "Camera" });
  if (c.reportCount >= 10) out.push({ id: "reporter-10", label: "Eyes on the Street", icon: "ScanSearch" });
  if (c.confirmCount >= 5) out.push({ id: "watchdog", label: "Watchdog", icon: "ThumbsUp" });
  if (c.resolveCount >= 1) out.push({ id: "fixer", label: "Fixer", icon: "ShieldCheck" });
  if (c.resolveCount >= 5) out.push({ id: "loop-closer", label: "Loop Closer", icon: "CheckCircle2" });
  return out;
}
