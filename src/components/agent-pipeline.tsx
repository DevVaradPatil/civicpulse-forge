"use client";

import { useState } from "react";
import {
  ScanSearch,
  Layers,
  Building2,
  ShieldCheck,
  Check,
  Clock,
  Loader2,
  Copy,
  Mail,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CATEGORIES } from "@/lib/domain";
import type { Complaint, Issue } from "@/lib/types";

type StepStatus = "done" | "pending" | "active";

function Step({
  icon,
  title,
  status,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  status: StepStatus;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-full ${
            status === "done"
              ? "bg-brand text-brand-fg"
              : "border border-border bg-surface text-muted"
          }`}
        >
          {status === "done" ? <Check className="h-4 w-4" /> : icon}
        </span>
        <span className="mt-1 w-px flex-1 bg-border last:hidden" />
      </div>
      <div className="flex-1 pb-5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{title}</p>
          {status === "pending" && (
            <span className="flex items-center gap-1 text-xs text-muted">
              <Clock className="h-3 w-3" /> pending
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-muted">{children}</div>
      </div>
    </div>
  );
}

export function AgentPipeline({
  issue,
  nearbyDuplicates,
}: {
  issue: Issue;
  nearbyDuplicates: number;
}) {
  const department = CATEGORIES[issue.category].department;
  const [complaint, setComplaint] = useState<Complaint | null>(issue.routing ?? null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function draft() {
    setLoading(true);
    try {
      const r = await fetch(`/api/issues/${issue.id}/complaint`, { method: "POST" });
      const d = await r.json();
      if (r.ok) setComplaint(d.complaint);
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    if (!complaint) return;
    navigator.clipboard.writeText(`${complaint.subject}\n\n${complaint.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const mailto = complaint
    ? `mailto:?subject=${encodeURIComponent(complaint.subject)}&body=${encodeURIComponent(complaint.body)}`
    : "#";

  return (
    <div className="mt-6 rounded-lg border border-border p-5">
      <h2 className="flex items-center gap-2 font-medium">
        <Bot className="h-4 w-4 text-brand" />
        AI agent pipeline
      </h2>
      <p className="mt-1 mb-4 text-sm text-muted">
        How CivicPulse&rsquo;s agents processed this report.
      </p>

      {/* 1. Triage */}
      <Step icon={<ScanSearch className="h-4 w-4" />} title="Triage agent" status="done">
        Classified as <strong>{CATEGORIES[issue.category].label}</strong>, severity{" "}
        {issue.severity}/5
        {typeof issue.aiConfidence === "number" &&
          ` · ${Math.round(issue.aiConfidence * 100)}% confidence`}
        .
      </Step>

      {/* 2. Dedup */}
      <Step icon={<Layers className="h-4 w-4" />} title="Dedup agent" status="done">
        {nearbyDuplicates > 0
          ? `${nearbyDuplicates} similar report${nearbyDuplicates === 1 ? "" : "s"} nearby — clustered to keep signal clean.`
          : "No duplicates nearby — logged as a unique report."}
      </Step>

      {/* 3. Routing */}
      <Step
        icon={<Building2 className="h-4 w-4" />}
        title="Routing agent"
        status={complaint ? "done" : "active"}
      >
        Responsible authority: <strong>{department}</strong>.
        {!complaint ? (
          <div className="mt-2">
            <Button variant="secondary" onClick={draft} disabled={loading} className="px-3 py-1.5 text-xs">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
              Draft official complaint
            </Button>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-border bg-surface p-3 text-fg">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-brand-fg">
                {complaint.priority} priority
              </span>
              <span>Est. resolution: {complaint.slaEstimate}</span>
            </div>
            <p className="mt-2 text-sm font-medium">{complaint.subject}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted">{complaint.body}</p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={copy} className="px-3 py-1.5 text-xs">
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <a
                href={mailto}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium hover:bg-border/40"
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </a>
            </div>
          </div>
        )}
      </Step>

      {/* 4. Verifier */}
      <Step
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Resolution Verifier agent"
        status={issue.resolution?.verified ? "done" : "pending"}
      >
        {issue.resolution?.verified
          ? `Fix verified from the after-photo. ${issue.resolution.note ?? ""}`
          : "Awaiting an after-photo to verify the fix."}
      </Step>
    </div>
  );
}
