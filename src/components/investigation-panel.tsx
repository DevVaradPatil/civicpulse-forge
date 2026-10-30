"use client";

import { useState } from "react";
import {
  Bot,
  Loader2,
  Wrench,
  Check,
  AlertTriangle,
  Copy,
  RefreshCw,
  Quote,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Investigation, Issue } from "@/lib/types";

const PRIORITY_CLASS: Record<string, string> = {
  Low: "bg-sev-low",
  Medium: "bg-sev-med",
  High: "bg-sev-high",
  Urgent: "bg-sev-critical",
};

function argSummary(args: Record<string, unknown>): string {
  const parts = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "number" ? Number(v.toFixed?.(4) ?? v) : String(v)}`);
  return parts.join(", ");
}

/**
 * Runs the multi-step investigation agent and shows its tool-call trace.
 *
 * The trace is the point: it shows which tools the agent chose, the arguments
 * it passed, whether each call succeeded, and how it recovered from the ones
 * that did not — rather than asking anyone to take the conclusion on trust.
 */
export function InvestigationPanel({ issue }: { issue: Issue }) {
  const [data, setData] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/issues/${issue.id}/investigate${refresh ? "?refresh=1" : ""}`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.investigation) {
        setError(json?.error ?? "The investigation could not be completed.");
        return;
      }
      setData(json.investigation as Investigation);
      setCached(Boolean(json.cached));
    } catch {
      setError("Could not reach the investigation service.");
    } finally {
      setLoading(false);
    }
  }

  function copyComplaint() {
    if (!data) return;
    navigator.clipboard.writeText(`${data.complaint.subject}\n\n${data.complaint.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-6 rounded-lg border border-border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            <Bot className="h-4 w-4 text-brand" />
            Investigation agent
          </h2>
          <p className="mt-1 text-sm text-muted">
            Plans its own steps, queries the real grievance records with tools, and shows every
            call it made.
          </p>
        </div>
        {data ? (
          <Button variant="secondary" onClick={() => run(true)} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Re-run
          </Button>
        ) : (
          <Button onClick={() => run()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
            {loading ? "Investigating…" : "Run investigation"}
          </Button>
        )}
      </div>

      {loading && !data && (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          The agent is choosing tools and querying the records…
        </p>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-sev-med/30 bg-sev-med/10 p-3 text-sm text-sev-med">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p>{error}</p>
            <button onClick={() => run(true)} className="mt-1 font-medium underline">
              Try again
            </button>
          </div>
        </div>
      )}

      {data && (
        <div className="mt-5 space-y-5">
          {/* Tool-call trace */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <Wrench className="h-4 w-4 text-muted" />
              Tool calls ({data.trace.length})
              <span className="font-normal text-muted">
                · {(data.durationMs / 1000).toFixed(1)}s{data.model ? ` · ${data.model}` : ""}
                {cached ? " · cached" : ""}
              </span>
            </h3>
            {data.trace.length === 0 ? (
              <p className="mt-2 text-sm text-muted">
                The agent answered without needing a tool.
              </p>
            ) : (
              <ol className="mt-2 space-y-1.5">
                {data.trace.map((t) => (
                  <li
                    key={t.step}
                    className="flex items-start gap-2 rounded-lg border border-border bg-surface p-2.5 text-sm"
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white ${
                        t.ok ? "bg-status-resolved" : "bg-sev-med"
                      }`}
                      title={t.ok ? "Succeeded" : "Rejected — the agent corrected itself"}
                    >
                      {t.ok ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-xs">
                        {t.step}. {t.tool}({argSummary(t.args)})
                      </p>
                      <p className="mt-0.5 text-muted">{t.summary}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{t.durationMs}ms</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Conclusion */}
          <div>
            <h3 className="text-sm font-medium">What the agent concluded</h3>
            <p className="mt-1.5 text-sm">{data.summary}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {data.recommendedAgencyLabel && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 font-medium">
                  <Building2 className="h-3 w-3" />
                  {data.recommendedAgencyLabel}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-0.5 font-medium text-white ${
                  PRIORITY_CLASS[data.priority] ?? "bg-sev-med"
                }`}
              >
                {data.priority} priority
              </span>
            </div>
          </div>

          {/* Findings, each citing the tool it came from */}
          {data.findings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Evidence</h3>
              <ul className="mt-2 space-y-2">
                {data.findings.map((f, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                    <div>
                      <p>{f.claim}</p>
                      {f.source && (
                        <p className="font-mono text-xs text-muted">from {f.source}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Drafted complaint */}
          {data.complaint.body && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium">{data.complaint.subject}</h3>
                <button
                  onClick={copyComplaint}
                  className="flex shrink-0 items-center gap-1 text-xs text-muted hover:text-fg"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{data.complaint.body}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
