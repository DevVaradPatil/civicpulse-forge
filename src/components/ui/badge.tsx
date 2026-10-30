import { severityMeta, STATUSES, type IssueStatus } from "@/lib/domain";

// Literal class strings so Tailwind v4 detects them at build time.
const SEV_CLASS: Record<string, string> = {
  "sev-low": "bg-sev-low",
  "sev-med": "bg-sev-med",
  "sev-high": "bg-sev-high",
  "sev-critical": "bg-sev-critical",
};

const STATUS_CLASS: Record<IssueStatus, string> = {
  reported: "bg-status-reported",
  verified: "bg-status-verified",
  in_progress: "bg-status-progress",
  resolved: "bg-status-resolved",
};

const base =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white";

export function SeverityBadge({ severity }: { severity: number }) {
  const meta = severityMeta(severity);
  return (
    <span className={`${base} ${SEV_CLASS[meta.token]}`}>
      {meta.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  const meta = STATUSES[status];
  return (
    <span className={`${base} ${STATUS_CLASS[status]}`}>{meta.label}</span>
  );
}
