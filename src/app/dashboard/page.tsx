"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleDot,
  Flame,
  ListChecks,
  RotateCcw,
  Building2,
  MapPinned,
  Database,
} from "lucide-react";
import { CategoryIcon } from "@/components/ui/category-icon";
import { Donut, TrendArea, HBar } from "@/components/charts";
import { InsightsWidget } from "@/components/insights-widget";
import {
  CATEGORIES,
  STATUSES,
  agencyLabel,
  isRealWard,
  UNATTRIBUTED_WARD,
  type IssueStatus,
  type IssueCategory,
} from "@/lib/domain";
import { CATEGORY_COLOR, STATUS_COLOR, SEVERITY_COLOR } from "@/lib/colors";
import type {
  AgencyStat,
  DashboardStats,
  Hotspot,
  IngestProvenance,
  WardStat,
} from "@/lib/types";

const SEV = [
  { key: "critical", label: "Critical" },
  { key: "high", label: "High" },
  { key: "med", label: "Medium" },
  { key: "low", label: "Low" },
] as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>{icon}</span>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
      <div className="text-sm text-muted">{label}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: React.ReactNode;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <h2 className="text-sm font-medium">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** One row of the accountability table: resolved vs still-open, with the rate. */
function RateRow({
  label,
  resolved,
  open,
  rate,
  total,
  max,
}: {
  label: string;
  resolved: number;
  open: number;
  rate: number;
  total: number;
  max: number;
}) {
  const width = max ? Math.round((total / max) * 100) : 0;
  const resolvedShare = total ? Math.round((resolved / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="truncate font-medium">{label}</span>
        <span className="shrink-0 tabular-nums text-muted">
          {pct(rate)} <span className="text-xs">· {total}</span>
        </span>
      </div>
      <div
        className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface"
        role="img"
        aria-label={`${resolved} resolved, ${open} open`}
      >
        <div className="flex h-full" style={{ width: `${width}%` }}>
          <div
            className="h-full bg-status-resolved"
            style={{ width: `${resolvedShare}%` }}
          />
          <div className="h-full flex-1 bg-status-reported" />
        </div>
      </div>
      <div className="mt-1 text-xs text-muted">
        {resolved} resolved · {open} open
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [agencies, setAgencies] = useState<AgencyStat[]>([]);
  const [wards, setWards] = useState<WardStat[]>([]);
  const [provenance, setProvenance] = useState<IngestProvenance | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        if (!alive) return;
        setStats(d.stats);
        setHotspots(d.hotspots ?? []);
        setAgencies(d.agencies ?? []);
        setWards(d.wards ?? []);
        setProvenance(d.provenance ?? null);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Dashboard unavailable</h1>
        <p className="mt-2 text-sm text-muted">
          The dashboard could not be loaded. No figures are shown rather than stale ones.
        </p>
        <button
          onClick={() => location.reload()}
          className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="h-7 w-48 animate-pulse rounded bg-surface" />
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-60 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  const catMax = Math.max(1, ...Object.values(stats.byCategory));
  const sevMax = Math.max(1, ...Object.values(stats.bySeverity));
  const anyRated = Object.values(stats.bySeverity).some((v) => v > 0);
  const statusSegments = (Object.keys(stats.byStatus) as IssueStatus[])
    .filter((s) => stats.byStatus[s] > 0)
    .map((s) => ({
      label: STATUSES[s].label,
      value: stats.byStatus[s],
      color: STATUS_COLOR[s],
    }));

  const topAgencies = agencies.filter((a) => a.total > 0).slice(0, 8);
  const agencyMax = Math.max(1, ...topAgencies.map((a) => a.total));
  // The dataset's catch-all ward is not a place, so it is kept out of rankings.
  const rankedWards = wards.filter((w) => isRealWard(w.ward)).slice(0, 8);
  const wardMax = Math.max(1, ...rankedWards.map((w) => w.total));
  const unattributed = wards.find((w) => w.ward === UNATTRIBUTED_WARD);

  const windowLabel =
    stats.window.start && stats.window.end
      ? `${fmtDate(stats.window.start)} – ${fmtDate(stats.window.end)}`
      : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Impact dashboard</h1>
      <p className="text-sm text-muted">
        Civic-issue health across Bengaluru
        {windowLabel ? ` · records from ${windowLabel}` : ""}.
      </p>

      {/* Provenance — every number below traces to these records. */}
      {provenance && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted">
          <Database className="h-3.5 w-3.5 shrink-0" />
          <span>
            {(provenance.rowsInDb ?? provenance.written).toLocaleString("en-IN")} records from{" "}
            <a
              href={provenance.datasetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-fg underline"
            >
              {provenance.resourceName}
            </a>{" "}
            · {provenance.attribution} · {provenance.license}
          </span>
          <span>· ingested {fmtDate(provenance.ingestedAt)}</span>
        </div>
      )}

      {/* Stat cards */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<ListChecks className="h-5 w-5" />}
          label="Total records"
          value={stats.total.toLocaleString("en-IN")}
          sub={`${stats.officialRecords.toLocaleString("en-IN")} official · ${stats.citizenReports} citizen`}
          accent="bg-brand/10 text-brand"
        />
        <StatCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="Resolved"
          value={pct(stats.resolutionRate)}
          sub={`${stats.resolved.toLocaleString("en-IN")} of ${(stats.total - stats.undecided).toLocaleString("en-IN")} decided`}
          accent="bg-status-resolved/10 text-status-resolved"
        />
        <StatCard
          icon={<CircleDot className="h-5 w-5" />}
          label="Still open"
          value={stats.open.toLocaleString("en-IN")}
          sub={stats.undecided > 0 ? `${stats.undecided} rejected or closed` : undefined}
          accent="bg-status-progress/10 text-status-progress"
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" />}
          label="Re-opened"
          value={(stats.byStatus.reopened ?? 0).toLocaleString("en-IN")}
          sub="closed out, then raised again"
          accent="bg-status-reopened/10 text-status-reopened"
        />
      </div>

      {/* Charts row */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Status breakdown">
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Donut
              segments={statusSegments}
              centerValue={stats.total.toLocaleString("en-IN")}
              centerLabel="records"
            />
            <ul className="w-full space-y-1.5 text-sm">
              {statusSegments.map((s) => (
                <li key={s.label} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1">{s.label}</span>
                  <span className="tabular-nums text-muted">
                    {s.value.toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>

        <Card
          title="Volume by month"
          note={
            windowLabel
              ? `Last ${stats.trend.length} months of the records held — ending ${
                  stats.window.end ? fmtDate(stats.window.end) : ""
                }, not today.`
              : undefined
          }
        >
          {stats.trend.length > 0 ? (
            <TrendArea points={stats.trend} />
          ) : (
            <p className="text-sm text-muted">No dated records yet.</p>
          )}
        </Card>
      </div>

      {/* Accountability */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-brand" /> Agency accountability
            </span>
          }
          note="Resolution rate over records the agency decided on. Rejected and closed records are excluded."
        >
          {topAgencies.length === 0 ? (
            <p className="text-sm text-muted">No agency data yet.</p>
          ) : (
            <div className="space-y-3">
              {topAgencies.map((a) => (
                <RateRow
                  key={a.agency ?? "unassigned"}
                  label={a.agency ? agencyLabel(a.agency) : "Unassigned by the source"}
                  resolved={a.resolved}
                  open={a.open}
                  rate={a.resolutionRate}
                  total={a.total}
                  max={agencyMax}
                />
              ))}
            </div>
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <MapPinned className="h-4 w-4 text-brand" /> Busiest wards
            </span>
          }
          note={
            unattributed
              ? `${unattributed.total.toLocaleString("en-IN")} records carry the dataset's catch-all ward "${UNATTRIBUTED_WARD}" and are left out of this ranking.`
              : undefined
          }
        >
          {rankedWards.length === 0 ? (
            <p className="text-sm text-muted">No ward data yet.</p>
          ) : (
            <div className="space-y-3">
              {rankedWards.map((w) => (
                <RateRow
                  key={w.ward}
                  label={w.ward}
                  resolved={w.resolved}
                  open={w.open}
                  rate={w.resolutionRate}
                  total={w.total}
                  max={wardMax}
                />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Breakdown bars */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By category">
          <div className="space-y-3">
            {(Object.keys(stats.byCategory) as IssueCategory[])
              .filter((c) => stats.byCategory[c] > 0)
              .sort((a, b) => stats.byCategory[b] - stats.byCategory[a])
              .map((c) => (
                <HBar
                  key={c}
                  label={
                    <>
                      <CategoryIcon category={c} className="h-3.5 w-3.5" />
                      {CATEGORIES[c].label}
                    </>
                  }
                  value={stats.byCategory[c]}
                  max={catMax}
                  color={CATEGORY_COLOR[c]}
                />
              ))}
          </div>
        </Card>

        <Card
          title="By AI severity"
          note="Severity is assessed by the triage agent from a citizen photo. Imported official records carry none."
        >
          {anyRated ? (
            <div className="space-y-3">
              {SEV.map((sv) => (
                <HBar
                  key={sv.key}
                  label={sv.label}
                  value={stats.bySeverity[sv.key]}
                  max={sevMax}
                  color={SEVERITY_COLOR[sv.key]}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">
              No AI severity ratings yet — all {stats.unrated.toLocaleString("en-IN")} records are
              imported official grievances. Ratings appear as citizens file photo reports.
            </p>
          )}
        </Card>
      </div>

      {/* Hotspots */}
      <div className="mt-4">
        <Card
          title={
            <span className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-sev-high" /> Recurring hotspots
            </span>
          }
          note="Clusters of 2+ records within roughly the same 1.2km cell, computed from the real coordinates."
        >
          {hotspots.length === 0 ? (
            <p className="text-sm text-muted">No hotspots yet — they emerge as issues cluster.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {hotspots.map((h) => (
                <a
                  key={h.cell}
                  href={`https://www.openstreetmap.org/?mlat=${h.lat}&mlon=${h.lng}#map=15/${h.lat}/${h.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-border p-3 hover:bg-surface"
                >
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <CategoryIcon category={h.topCategory} className="h-3.5 w-3.5" />
                    {CATEGORIES[h.topCategory].label}
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {h.ward ?? `${h.lat.toFixed(3)}, ${h.lng.toFixed(3)}`}
                  </div>
                  <div className="text-xs text-muted">
                    {h.count.toLocaleString("en-IN")} records · {h.openCount} still open
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <InsightsWidget />
      </div>
    </div>
  );
}
