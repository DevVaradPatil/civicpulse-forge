// Community-hero tiers + achievement badges.
//
// The point of this system is to reward the behaviour the city actually needs,
// not raw activity. Two things follow from that:
//
//  - A *verified* fix is worth far more than a report, because closing the loop
//    is the hard part and the only step that changes anything on the ground.
//  - Badges are earned against the real grievance data — the wards and
//    categories a person has actually covered — rather than a bare tally, so
//    they say something true about where that person has helped.

export interface Tier {
  name: string;
  min: number;
  /** What this tier means, in plain words. */
  blurb: string;
}

export const TIERS: Tier[] = [
  { name: "Civic Rookie", min: 0, blurb: "Just getting started." },
  { name: "Active Citizen", min: 25, blurb: "Reporting what others walk past." },
  { name: "Street Guardian", min: 75, blurb: "A steady presence in the neighbourhood." },
  { name: "Ward Champion", min: 200, blurb: "Driving fixes across a whole ward." },
  { name: "Community Hero", min: 500, blurb: "Changing how the city answers." },
];

export function tierFor(points: number): Tier {
  return [...TIERS].reverse().find((t) => points >= t.min) ?? TIERS[0];
}

export function nextTier(points: number): Tier | null {
  return TIERS.find((t) => t.min > points) ?? null;
}

/** Progress through the current tier, 0-1. Full bar at the top tier. */
export function tierProgress(points: number): number {
  const current = tierFor(points);
  const next = nextTier(points);
  if (!next) return 1;
  const span = next.min - current.min;
  return span > 0 ? Math.min(1, Math.max(0, (points - current.min) / span)) : 0;
}

/** What each action is worth. Mirrors award_points() in supabase/schema.sql. */
export const POINTS = {
  report: 10,
  confirm: 5,
  resolve: 20,
} as const;

export interface Counts {
  reportCount: number;
  confirmCount: number;
  resolveCount: number;
}

/** What the person's own reports cover — read from their real issues. */
export interface Coverage {
  /** Distinct named wards they have reported in. */
  wards: number;
  /** Distinct categories they have reported. */
  categories: number;
  /** Reports whose fix an AI verified from a before/after photo. */
  verifiedFixes: number;
  /** Reports the community confirmed up to "verified". */
  communityVerified: number;
}

export const EMPTY_COVERAGE: Coverage = {
  wards: 0,
  categories: 0,
  verifiedFixes: 0,
  communityVerified: 0,
};

/**
 * Derives coverage from a person's own reports. Only named wards count — the
 * dataset's catch-all "Other" is not a place, so it must not inflate a
 * "reported across N wards" badge.
 */
export function coverageFrom(
  reports: { ward?: string | null; category: string; status: string; resolution?: { verified?: boolean } | undefined }[],
): Coverage {
  const wards = new Set<string>();
  const categories = new Set<string>();
  let verifiedFixes = 0;
  let communityVerified = 0;

  for (const r of reports) {
    if (r.ward && r.ward !== "Other") wards.add(r.ward);
    if (r.category) categories.add(r.category);
    if (r.resolution?.verified) verifiedFixes++;
    if (r.status === "verified" || r.status === "resolved") communityVerified++;
  }

  return {
    wards: wards.size,
    categories: categories.size,
    verifiedFixes,
    communityVerified,
  };
}

export interface Badge {
  id: string;
  label: string;
  /** lucide icon name */
  icon: string;
  /** Why it was awarded — shown on hover so a badge is never unexplained. */
  detail: string;
}

/**
 * Badges a person has earned. `coverage` comes from their actual reports, so
 * "reported across 3 wards" is a checkable statement rather than a label.
 */
export function badgesFor(c: Counts, coverage: Coverage = EMPTY_COVERAGE): Badge[] {
  const out: Badge[] = [];

  if (c.reportCount >= 1)
    out.push({
      id: "first-report",
      label: "First Report",
      icon: "Camera",
      detail: "Filed a first civic report.",
    });
  if (c.reportCount >= 10)
    out.push({
      id: "reporter-10",
      label: "Eyes on the Street",
      icon: "ScanSearch",
      detail: `${c.reportCount} reports filed.`,
    });
  if (c.confirmCount >= 5)
    out.push({
      id: "watchdog",
      label: "Watchdog",
      icon: "ThumbsUp",
      detail: `Confirmed ${c.confirmCount} reports from other citizens.`,
    });

  // Coverage — grounded in the real wards and categories they reported in.
  if (coverage.wards >= 3)
    out.push({
      id: "ward-rover",
      label: "Ward Rover",
      icon: "MapPinned",
      detail: `Reported in ${coverage.wards} different wards.`,
    });
  if (coverage.categories >= 5)
    out.push({
      id: "all-rounder",
      label: "All-Rounder",
      icon: "Layers",
      detail: `Reported ${coverage.categories} different kinds of civic issue.`,
    });
  if (coverage.communityVerified >= 1)
    out.push({
      id: "corroborated",
      label: "Corroborated",
      icon: "Users",
      detail: `${coverage.communityVerified} report(s) confirmed by enough neighbours to be verified.`,
    });

  // Closing the loop is the hardest and most valuable step.
  if (coverage.verifiedFixes >= 1 || c.resolveCount >= 1)
    out.push({
      id: "fixer",
      label: "Fixer",
      icon: "ShieldCheck",
      detail: "Submitted an after-photo that the AI accepted as a fix.",
    });
  if (coverage.verifiedFixes >= 5 || c.resolveCount >= 5)
    out.push({
      id: "loop-closer",
      label: "Loop Closer",
      icon: "CheckCircle2",
      detail: "Five issues followed all the way to a verified fix.",
    });

  return out;
}

/** Every badge, with earned state — so the profile can show what is still ahead. */
export function allBadgesWithState(
  c: Counts,
  coverage: Coverage = EMPTY_COVERAGE,
): (Badge & { earned: boolean })[] {
  const earned = new Set(badgesFor(c, coverage).map((b) => b.id));
  const catalogue = badgesFor(
    { reportCount: 10, confirmCount: 5, resolveCount: 5 },
    { wards: 3, categories: 5, verifiedFixes: 5, communityVerified: 1 },
  );
  return catalogue.map((b) => ({ ...b, earned: earned.has(b.id) }));
}
