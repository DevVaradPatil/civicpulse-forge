"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, Inbox } from "lucide-react";
import { IssueCard } from "@/components/issue-card";
import { CategoryIcon } from "@/components/ui/category-icon";
import { LinkButton } from "@/components/ui/button";
import {
  CATEGORY_LIST,
  STATUS_ORDER,
  STATUSES,
  type IssueCategory,
  type IssueStatus,
} from "@/lib/domain";
import { CATEGORY_COLOR, SEVERITY_COLOR, UNRATED_HEX } from "@/lib/colors";
import type { ColorBy } from "@/components/issue-map";
import type { Issue, WardChoropleth } from "@/lib/types";

const IssueMap = dynamic(() => import("@/components/issue-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-muted">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  ),
});

const SEV_LEGEND = [
  { label: "Low", color: SEVERITY_COLOR.low },
  { label: "Medium", color: SEVERITY_COLOR.med },
  { label: "High", color: SEVERITY_COLOR.high },
  { label: "Critical", color: SEVERITY_COLOR.critical },
  // Imported official records carry no AI severity rating.
  { label: "Unrated", color: UNRATED_HEX },
];

/** Mirrors rateColor() in issue-map.tsx — keep the two in step. */
const WARD_SCALE = [
  { color: "#b91c1c", label: "under 10%" },
  { color: "#ef4444", label: "10-20%" },
  { color: "#f59e0b", label: "20-30%" },
  { color: "#eab308", label: "30-45%" },
  { color: "#84cc16", label: "45-60%" },
  { color: "#16a34a", label: "60% and over" },
];

/** Markers loaded onto the map. The table holds far more; the label says so. */
const MAP_LIMIT = 1000;

export default function MapPage() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [total, setTotal] = useState(0);
  const [colorBy, setColorBy] = useState<ColorBy>("severity");
  const [showWards, setShowWards] = useState(false);
  const [wardStats, setWardStats] = useState<Map<number, WardChoropleth>>(new Map());
  const [cats, setCats] = useState<Set<IssueCategory>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());

  useEffect(() => {
    // Ward shading is loaded once, alongside the issues.
    fetch("/api/wards")
      .then((r) => r.json())
      .then((d) => {
        const m = new Map<number, WardChoropleth>();
        for (const w of (d.wards ?? []) as WardChoropleth[]) m.set(w.wardId, w);
        setWardStats(m);
      })
      .catch(() => setWardStats(new Map()));

    fetch(`/api/issues?limit=${MAP_LIMIT}`)
      .then((r) => r.json())
      .then((d) => {
        setIssues(d.issues ?? []);
        setTotal(Number(d.total) || (d.issues?.length ?? 0));
      })
      .catch(() => setIssues([]));
  }, []);

  function toggle<T>(set: Set<T>, v: T, setter: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    setter(next);
  }

  const filtered = useMemo(() => {
    if (!issues) return [];
    return issues.filter(
      (i) =>
        (cats.size === 0 || cats.has(i.category)) &&
        (statuses.size === 0 || statuses.has(i.status)),
    );
  }, [issues, cats, statuses]);

  const map = useMemo(
    () => (
      <IssueMap
        issues={filtered}
        colorBy={colorBy}
        wardStats={wardStats}
        showWards={showWards}
      />
    ),
    [filtered, colorBy, wardStats, showWards],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issue map</h1>
          <p className="text-sm text-muted">
            {issues === null
              ? "Loading…"
              : `${filtered.length.toLocaleString("en-IN")} shown` +
                (issues.length < total
                  ? ` · newest ${issues.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} records in Bengaluru`
                  : ` of ${total.toLocaleString("en-IN")} records in Bengaluru`)}
          </p>
        </div>
        <LinkButton href="/report">Report</LinkButton>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
        <button
          onClick={() => setShowWards((v) => !v)}
          disabled={wardStats.size === 0}
          className={`rounded-full px-3 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
            showWards ? "bg-brand text-brand-fg" : "bg-surface text-muted hover:text-fg"
          }`}
          title={
            wardStats.size === 0
              ? "Ward statistics are unavailable right now"
              : "Shade BBMP wards by their real resolution rate"
          }
        >
          Ward resolution rate
        </button>
        <span className="mr-1 h-4 w-px bg-border" />
        <span className="text-xs font-medium text-muted">Color by</span>
        {(["severity", "category"] as ColorBy[]).map((m) => (
          <button
            key={m}
            onClick={() => setColorBy(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${
              colorBy === m ? "bg-brand text-brand-fg" : "bg-surface text-muted hover:text-fg"
            }`}
          >
            {m}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {CATEGORY_LIST.map((c) => (
          <button
            key={c.id}
            onClick={() => toggle(cats, c.id, setCats)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
              cats.has(c.id) ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:text-fg"
            }`}
          >
            <CategoryIcon category={c.id} className="h-3 w-3" />
            {c.label}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-border" />

        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => toggle(statuses, s, setStatuses)}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              statuses.has(s) ? "border-brand bg-brand/10 text-fg" : "border-border text-muted hover:text-fg"
            }`}
          >
            {STATUSES[s].label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative h-[60vh] min-w-0 overflow-hidden rounded-lg border border-border lg:h-[72vh]">
          {map}
          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-[1000] rounded-lg border border-border bg-bg/90 p-2.5 text-xs backdrop-blur">
            {showWards && (
              <div className="mb-2 border-b border-border pb-2">
                <div className="mb-1 font-medium">Ward resolved %</div>
                <div className="flex items-center gap-1">
                  {WARD_SCALE.map((s) => (
                    <span
                      key={s.label}
                      title={s.label}
                      className="h-2.5 w-5"
                      style={{ background: s.color }}
                    />
                  ))}
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-muted">
                  <span>0%</span>
                  <span>60%+</span>
                </div>
                <p className="mt-1 text-[10px] text-muted">Unshaded = no records</p>
              </div>
            )}
            <div className="mb-1 font-medium">{colorBy === "severity" ? "Severity" : "Category"}</div>
            <ul className="space-y-1">
              {colorBy === "severity"
                ? SEV_LEGEND.map((l) => (
                    <li key={l.label} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                      {l.label}
                    </li>
                  ))
                : CATEGORY_LIST.map((c) => (
                    <li key={c.id} className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLOR[c.id] }} />
                      {c.label}
                    </li>
                  ))}
            </ul>
          </div>
        </div>

        <div className="min-w-0 space-y-2 lg:max-h-[72vh] lg:overflow-y-auto">
          {issues === null ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-muted">
              <Inbox className="mx-auto h-7 w-7" />
              <p className="mt-2 text-sm">No issues match these filters.</p>
            </div>
          ) : (
            filtered.map((i) => <IssueCard key={i.id} issue={i} />)
          )}
        </div>
      </div>
    </div>
  );
}
