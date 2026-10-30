"use client";

import { useEffect, useState } from "react";
import { Sparkles, X, RefreshCw, Loader2, TrendingUp } from "lucide-react";
import { timeAgo } from "@/lib/format";
import type { Insights } from "@/lib/types";

const CACHE_KEY = "cp_insights";
const TTL = 5 * 60 * 1000; // 5 minutes

function readCache(): Insights | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts < TTL) return data as Insights;
  } catch {
    /* ignore */
  }
  return null;
}

function writeCache(data: Insights) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function InsightsWidget() {
  const [open, setOpen] = useState(true); // auto-show on load
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(force = false) {
    if (!force) {
      const cached = readCache();
      if (cached) {
        setInsights(cached);
        return;
      }
    }
    setLoading(true);
    try {
      const data = (await (await fetch(`/api/insights${force ? "?refresh=1" : ""}`)).json()) as Insights;
      setInsights(data);
      writeCache(data);
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate on mount (uses the localStorage cache when fresh).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {open ? (
        <div className="flex max-h-[70vh] w-[min(360px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-lg">
          <header className="flex items-center justify-between border-b border-border p-3">
            <span className="flex items-center gap-2 font-medium">
              <Sparkles className="h-4 w-4 text-brand" /> AI insights
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => load(true)}
                disabled={loading}
                aria-label="Refresh insights"
                className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md p-1.5 text-muted hover:bg-surface hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>
          <div className="overflow-y-auto p-4 text-sm">
            {!insights ? (
              <div className="flex items-center gap-2 text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating insights…
              </div>
            ) : (
              <>
                <p>{insights.summary}</p>
                {insights.predictions.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {insights.predictions.map((p, i) => (
                      <li key={i} className="flex gap-2">
                        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                        <span>{p}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {insights.generatedAt > 0 && (
                  <p className="mt-3 text-xs text-muted">Updated {timeAgo(insights.generatedAt)}</p>
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-brand px-4 py-3 text-sm font-medium text-brand-fg shadow-lg transition-colors hover:bg-brand-hover"
        >
          <Sparkles className="h-5 w-5" /> AI insights
        </button>
      )}
    </div>
  );
}
