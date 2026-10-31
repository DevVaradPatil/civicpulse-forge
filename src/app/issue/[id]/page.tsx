import { notFound } from "next/navigation";
import { MapPin, Users, Building2, Database, ExternalLink, Mic } from "lucide-react";
import { getIssue, countNearbyDuplicates } from "@/lib/server/issues";
import { CATEGORIES, agencyLabel, UNATTRIBUTED_WARD } from "@/lib/domain";
import { resolveAgency } from "@/lib/server/agencies";
import { SeverityBadge, StatusBadge, RecordSourceBadge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/ui/category-icon";
import { StatusTimeline } from "@/components/status-timeline";
import { AgentPipeline } from "@/components/agent-pipeline";
import { InvestigationPanel } from "@/components/investigation-panel";
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
  const routed = await resolveAgency(issue);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* Official open-data records have no photo; citizen reports do. */}
      {issue.photoPath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/media/${issue.photoPath}`}
          alt={issue.title}
          className="aspect-video w-full rounded-lg border border-border object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-border bg-surface">
          <p className="px-6 text-center text-sm text-muted">
            {issue.audioPath
              ? "Voice report — listen below"
              : "Official grievance record — no citizen photo"}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium">
          <CategoryIcon category={issue.category} className="h-3.5 w-3.5" />
          {cat.label}
        </span>
        <SeverityBadge severity={issue.severity} />
        <StatusBadge status={issue.status} />
        <RecordSourceBadge source={issue.source} />
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
          label={issue.locationSource === "approximate" ? "Location (approximate)" : "Location"}
          value={
            issue.locationSource === "approximate"
              ? "City centre — device location unavailable"
              : `${issue.lat.toFixed(4)}, ${issue.lng.toFixed(4)}`
          }
        />
        <Stat
          icon={<Building2 className="h-4 w-4" />}
          label={routed.basis === "derived" ? "Routed to (derived)" : "Routed to"}
          value={agencyLabel(routed.agency)}
        />
      </div>

      {/* A spoken report: the recording, and the citizen's own words. */}
      {issue.audioPath && (
        <div className="mt-6 rounded-lg border border-border p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Mic className="h-4 w-4 text-brand" />
            Voice report
            {issue.transcriptLanguage ? (
              <span className="font-normal text-muted">· spoken in {issue.transcriptLanguage}</span>
            ) : null}
          </h2>
          <audio controls src={`/api/media/${issue.audioPath}`} className="mt-3 w-full" />
          {issue.transcript && (
            <>
              <p className="mt-3 text-sm italic text-muted">&ldquo;{issue.transcript}&rdquo;</p>
              <p className="mt-2 text-xs text-muted">
                Transcribed by Sarvam AI. The title and description above are an English summary
                written from these words.
              </p>
            </>
          )}
        </div>
      )}

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

      {/* Provenance — this record is checkable against its source. */}
      {issue.source && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4 text-muted" />
            Source record
          </h2>
          <dl className="mt-2 grid gap-1 text-sm text-muted sm:grid-cols-2">
            <div>
              <dt className="inline">Dataset: </dt>
              <dd className="inline text-fg">{issue.source}</dd>
            </div>
            <div>
              <dt className="inline">Record id: </dt>
              <dd className="inline text-fg">{issue.sourceRecordId}</dd>
            </div>
            {issue.ward && (
              <div>
                <dt className="inline">Ward: </dt>
                <dd className="inline text-fg">
                  {issue.ward}
                  {issue.ward === UNATTRIBUTED_WARD && " (unattributed in the source)"}
                </dd>
              </div>
            )}
            {issue.ingestedAt && (
              <div>
                <dt className="inline">Ingested: </dt>
                <dd className="inline text-fg">
                  {new Date(issue.ingestedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </dd>
              </div>
            )}
          </dl>
          {issue.sourceUrl && (
            <a
              href={issue.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Verify this record at the source
            </a>
          )}
        </div>
      )}

      <InvestigationPanel issue={issue} />

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
