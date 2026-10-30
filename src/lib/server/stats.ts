import "server-only";
import { listIssues } from "@/lib/server/issues";
import { supabaseAdmin } from "@/lib/server/supabase";
import {
  STATUS_ORDER,
  CATEGORY_LIST,
  UNATTRIBUTED_WARD,
  type IssueCategory,
  type IssueStatus,
} from "@/lib/domain";
import type {
  AgencyStat,
  DashboardStats,
  Hotspot,
  Issue,
  IngestProvenance,
  WardStat,
} from "@/lib/types";

const HOTSPOT_PRECISION = 6; // ~1.2km cells — roughly neighbourhood scale.
const TREND_MONTHS = 12;
/** Recent issues shown in lists — not used for any aggregate number. */
const RECENT_LIMIT = 24;

function emptyStatus(): Record<IssueStatus, number> {
  return Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<IssueStatus, number>;
}
function emptyCategory(): Record<IssueCategory, number> {
  return Object.fromEntries(CATEGORY_LIST.map((c) => [c.id, 0])) as Record<IssueCategory, number>;
}

function emptyStats(): DashboardStats {
  return {
    total: 0,
    resolved: 0,
    open: 0,
    undecided: 0,
    unrated: 0,
    officialRecords: 0,
    citizenReports: 0,
    resolutionRate: 0,
    byStatus: emptyStatus(),
    byCategory: emptyCategory(),
    bySeverity: { low: 0, med: 0, high: 0, critical: 0 },
    window: { start: null, end: null },
    trend: [],
  };
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

type RawStats = {
  total?: number;
  resolved?: number;
  open?: number;
  undecided?: number;
  unrated?: number;
  officialRecords?: number;
  citizenReports?: number;
  byStatus?: Record<string, number>;
  byCategory?: Record<string, number>;
  bySeverity?: { low?: number; med?: number; high?: number; critical?: number };
  windowStart?: number | null;
  windowEnd?: number | null;
};

/**
 * Headline stats, aggregated in Postgres across every row (see
 * `dashboard_stats()` in supabase/schema.sql). Counts are never computed from a
 * fetched page of issues — with 16k+ records that would report a number drawn
 * from whatever slice happened to load.
 */
export async function computeStats(): Promise<DashboardStats> {
  const { data, error } = await supabaseAdmin.rpc("dashboard_stats");
  if (error) throw new Error(`dashboard_stats: ${error.message}`);

  const raw = (data ?? {}) as RawStats;
  const stats = emptyStats();

  stats.total = num(raw.total);
  stats.resolved = num(raw.resolved);
  stats.open = num(raw.open);
  stats.undecided = num(raw.undecided);
  stats.unrated = num(raw.unrated);
  stats.officialRecords = num(raw.officialRecords);
  stats.citizenReports = num(raw.citizenReports);

  // Only count statuses we know about, so an unexpected value in the database
  // can never be silently folded into an existing bucket.
  for (const [k, v] of Object.entries(raw.byStatus ?? {})) {
    if (k in stats.byStatus) stats.byStatus[k as IssueStatus] = num(v);
  }
  for (const [k, v] of Object.entries(raw.byCategory ?? {})) {
    if (k in stats.byCategory) stats.byCategory[k as IssueCategory] = num(v);
  }
  stats.bySeverity = {
    low: num(raw.bySeverity?.low),
    med: num(raw.bySeverity?.med),
    high: num(raw.bySeverity?.high),
    critical: num(raw.bySeverity?.critical),
  };

  stats.window = {
    start: raw.windowStart == null ? null : num(raw.windowStart),
    end: raw.windowEnd == null ? null : num(raw.windowEnd),
  };

  // Rejected and closed records were neither fixed nor left open, so they are
  // excluded from the denominator rather than counted as either.
  const decidable = stats.total - stats.undecided;
  stats.resolutionRate = decidable > 0 ? stats.resolved / decidable : 0;

  const { data: trend, error: tErr } = await supabaseAdmin.rpc("monthly_trend", {
    p_months: TREND_MONTHS,
  });
  if (tErr) console.error("monthly_trend failed:", tErr.message);
  stats.trend = ((trend ?? []) as { label: string; n: number }[]).map((r) => ({
    label: r.label,
    count: num(r.n),
  }));

  return stats;
}

/**
 * Recurring-issue clusters, grouped by geohash prefix in Postgres and labelled
 * with the ward they sit in. A geohash cell like "tdr1vt" is meaningless to a
 * reader (and to the insights agent, which would otherwise cite it), so each
 * cluster carries the ward name that most of its records report.
 */
export async function detectHotspots(limit = 5): Promise<Hotspot[]> {
  const cells = await detectHotspotsAt(HOTSPOT_PRECISION, 2 /* recurring only */, limit);
  return Promise.all(cells.map(async (h) => ({ ...h, ward: await wardForCell(h.cell) })));
}

/** The ward most records in a geohash cell belong to, or null if unknown. */
async function wardForCell(cell: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("issues")
    .select("ward")
    .like("geohash", `${cell}%`)
    .not("ward", "is", null)
    .limit(500);
  if (error || !data?.length) return null;
  const tally = new Map<string, number>();
  for (const r of data) {
    const w = r.ward as string;
    if (w === UNATTRIBUTED_WARD) continue; // the catch-all is not a place
    tally.set(w, (tally.get(w) ?? 0) + 1);
  }
  const top = [...tally].sort((a, b) => b[1] - a[1])[0];
  return top?.[0] ?? null;
}

async function detectHotspotsAt(
  precision: number,
  min: number,
  limit: number,
): Promise<Hotspot[]> {
  const { data, error } = await supabaseAdmin.rpc("hotspot_cells", {
    p_precision: precision,
    p_min: min,
    p_limit: limit,
  });
  if (error) {
    console.error("hotspot_cells failed:", error.message);
    return [];
  }
  type Row = {
    cell: string;
    lat: number;
    lng: number;
    n: number;
    open_count: number;
    top_category: string;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    cell: r.cell,
    lat: num(r.lat),
    lng: num(r.lng),
    count: num(r.n),
    openCount: num(r.open_count),
    topCategory: r.top_category as IssueCategory,
  }));
}

/**
 * Coarse grid of real record locations, for the homepage city scatter. Reuses
 * the hotspot grouping at a finer precision so the picture is drawn from actual
 * coordinates rather than a stock map image.
 */
export async function cityCells(limit = 600): Promise<Hotspot[]> {
  return detectHotspotsAt(HOTSPOT_PRECISION, 1, limit);
}

/** Per-agency resolved/open split — the accountability table. */
export async function agencyStats(): Promise<AgencyStat[]> {
  const { data, error } = await supabaseAdmin.rpc("agency_stats");
  if (error) {
    console.error("agency_stats failed:", error.message);
    return [];
  }
  type Row = {
    agency: string | null;
    total: number;
    resolved: number;
    open: number;
    undecided: number;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const decidable = num(r.total) - num(r.undecided);
    return {
      agency: r.agency,
      total: num(r.total),
      resolved: num(r.resolved),
      open: num(r.open),
      undecided: num(r.undecided),
      resolutionRate: decidable > 0 ? num(r.resolved) / decidable : 0,
    };
  });
}

/** Per-ward volume and resolution rate, highest volume first. */
export async function wardStats(): Promise<WardStat[]> {
  const { data, error } = await supabaseAdmin.rpc("ward_stats");
  if (error) {
    console.error("ward_stats failed:", error.message);
    return [];
  }
  type Row = { ward: string; total: number; resolved: number; open: number };
  return ((data ?? []) as Row[]).map((r) => {
    const decidable = num(r.resolved) + num(r.open);
    return {
      ward: r.ward,
      total: num(r.total),
      resolved: num(r.resolved),
      open: num(r.open),
      resolutionRate: decidable > 0 ? num(r.resolved) / decidable : 0,
    };
  });
}

/**
 * Where the ingested data came from, recorded by scripts/ingest-opencity.mjs.
 * Returns null when nothing has been ingested — the UI then shows no claim
 * about a source rather than a hardcoded one.
 */
export async function getIngestProvenance(): Promise<IngestProvenance | null> {
  const { data, error } = await supabaseAdmin
    .from("meta")
    .select("value")
    .eq("key", "ingest:opencity")
    .maybeSingle();
  if (error || !data?.value) return null;
  return data.value as IngestProvenance;
}

export async function getDashboard(): Promise<{
  stats: DashboardStats;
  hotspots: Hotspot[];
  agencies: AgencyStat[];
  wards: WardStat[];
  provenance: IngestProvenance | null;
  issues: Issue[];
}> {
  // Each piece degrades on its own: one failing panel must not blank the page.
  const [stats, hotspots, agencies, wards, provenance, issues] = await Promise.all([
    computeStats(),
    detectHotspots(),
    agencyStats(),
    wardStats(),
    getIngestProvenance(),
    listIssues(RECENT_LIMIT).catch(() => [] as Issue[]),
  ]);
  return { stats, hotspots, agencies, wards, provenance, issues };
}
