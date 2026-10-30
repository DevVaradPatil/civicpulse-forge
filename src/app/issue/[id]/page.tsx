import { notFound } from "next/navigation";
import { MapPin, Users, Building2 } from "lucide-react";
import { getIssue, countNearbyDuplicates } from "@/lib/server/issues";
import { CATEGORIES } from "@/lib/domain";
import { SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/ui/category-icon";
import { StatusTimeline } from "@/components/status-timeline";
import { AgentPipeline } from "@/components/agent-pipeline";
import { IssueActions } from "@/components/issue-actions";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function IssuePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();

  const cat = CATEGORIES[issue.category];
  const nearbyDuplicates = await countNearbyDuplicates(
    issue.lat,
    issue.lng,
    issue.category,
    issue.id,
  );

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/media/${issue.photoPath}`}
        alt={issue.title}
        className="aspect-video w-full rounded-lg border border-border object-cover"
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium">
          <CategoryIcon category={issue.category} className="h-3.5 w-3.5" />
          {cat.label}
        </span>
        <SeverityBadge severity={issue.severity} />
        <StatusBadge status={issue.status} />
        <span className="text-xs text-muted">{timeAgo(issue.createdAt)}</span>
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{issue.title}</h1>
      <p className="mt-2 text-muted">{issue.description}</p>

      <div className="mt-6 rounded-lg border border-border p-4">
        <StatusTimeline status={issue.status} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat icon={<Users className="h-4 w-4" />} label="Confirmations" value={String(issue.confirmations)} />
        <Stat
          icon={<MapPin className="h-4 w-4" />}
          label="Location"
          value={`${issue.lat.toFixed(4)}, ${issue.lng.toFixed(4)}`}
        />
        <Stat icon={<Building2 className="h-4 w-4" />} label="Routed to" value={cat.department} />
      </div>

      {issue.hazards.length > 0 && (
        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Safety hazards</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {issue.hazards.map((h) => (
              <li key={h}>• {h}</li>
            ))}
          </ul>
        </div>
      )}

      <AgentPipeline issue={issue} nearbyDuplicates={nearbyDuplicates} />

      <IssueActions issue={issue} />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
