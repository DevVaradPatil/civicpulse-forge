import { Landmark, Camera } from "lucide-react";
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
  reopened: "bg-status-reopened",
  closed: "bg-status-closed",
  rejected: "bg-status-rejected",
};

const base =
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white";

/**
 * Renders nothing when there is no severity. Official open-data records carry
 * no severity rating, so there is no number to show — and none is invented.
 */
export function SeverityBadge({ severity }: { severity: number | null | undefined }) {
  const meta = severityMeta(severity);
  if (!meta) return null;
  return <span className={`${base} ${SEV_CLASS[meta.token]}`}>{meta.label}</span>;
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  const meta = STATUSES[status];
  if (!meta) return null;
  return <span className={`${base} ${STATUS_CLASS[status]}`}>{meta.label}</span>;
}

const outline =
  "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs font-medium";

/**
 * Distinguishes an imported official grievance from a citizen photo report.
 * The two have genuinely different evidence behind them — an official record
 * has a case in an agency's system but no photo or AI severity; a citizen
 * report has a photo, an AI triage and community confirmations — so the UI
 * should never let them read as the same thing.
 */
export function RecordSourceBadge({
  source,
  className = "",
}: {
  source?: string | null;
  className?: string;
}) {
  const official = Boolean(source);
  return (
    <span
      className={`${outline} ${className} ${
        official ? "bg-surface text-muted" : "bg-brand/10 text-brand"
      }`}
      title={
        official
          ? "Imported from an official open-data grievance record"
          : "Filed by a citizen through CivicPulse, with a photo and AI triage"
      }
    >
      {official ? (
        <Landmark className="h-3 w-3" />
      ) : (
        <Camera className="h-3 w-3" />
      )}
      {official ? "Official record" : "Citizen report"}
    </span>
  );
}
