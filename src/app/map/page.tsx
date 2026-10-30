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
import { CATEGORY_COLOR, SEVERITY_COLOR } from "@/lib/colors";
import type { ColorBy } from "@/components/issue-map";
import type { Issue } from "@/lib/types";

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
];

export default function MapPage() {
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [colorBy, setColorBy] = useState<ColorBy>("severity");
  const [cats, setCats] = useState<Set<IssueCategory>>(new Set());
  const [statuses, setStatuses] = useState<Set<IssueStatus>>(new Set());

  useEffect(() => {
    fetch("/api/issues")
      .then((r) => r.json())
      .then((d) => setIssues(d.issues ?? []))
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
    () => <IssueMap issues={filtered} colorBy={colorBy} />,
    [filtered, colorBy],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issue map</h1>
          <p className="text-sm text-muted">
            {issues === null
              ? "Loading…"
              : `${filtered.length} of ${issues.length} issues across Delhi`}
          </p>
        </div>
        <LinkButton href="/report">Report</LinkButton>
      </div>

      {/* Controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border p-3">
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
