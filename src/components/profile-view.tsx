import {
  Camera,
  ScanSearch,
  ThumbsUp,
  ShieldCheck,
  CheckCircle2,
  Award,
  type LucideIcon,
} from "lucide-react";
import { IssueCard } from "@/components/issue-card";
import { tierFor, nextTier, badgesFor } from "@/lib/badges";
import type { Issue, LeaderUser } from "@/lib/types";

const BADGE_ICON: Record<string, LucideIcon> = {
  Camera,
  ScanSearch,
  ThumbsUp,
  ShieldCheck,
  CheckCircle2,
};

export function ProfileView({
  profile,
  reports,
}: {
  profile: LeaderUser;
  reports: Issue[];
}) {
  const tier = tierFor(profile.points);
  const next = nextTier(profile.points);
  const badges = badgesFor(profile);
  const initial = (profile.displayName || "U").charAt(0).toUpperCase();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-4">
        <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-brand text-2xl font-semibold text-brand-fg">
          {profile.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.photoURL} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{profile.displayName}</h1>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-0.5 text-xs font-medium text-brand-fg">
            <Award className="h-3.5 w-3.5" />
            {tier.name}
          </span>
        </div>
      </div>

      {/* Points + progress */}
      <div className="mt-6 rounded-lg border border-border p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold">{profile.points}</div>
            <div className="text-sm text-muted">civic points</div>
          </div>
          {next && (
            <div className="text-right text-sm text-muted">
              {next.min - profile.points} pts to{" "}
              <span className="font-medium text-fg">{next.name}</span>
            </div>
          )}
        </div>
        {next && (
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface">
            <div
              className="h-2 rounded-full bg-brand"
              style={{
                width: `${Math.min(100, Math.round((profile.points / next.min) * 100))}%`,
              }}
            />
          </div>
        )}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <Stat label="Reports" value={profile.reportCount} />
          <Stat label="Confirms" value={profile.confirmCount} />
          <Stat label="Fixes" value={profile.resolveCount} />
        </div>
      </div>

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">Badges</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {badges.map((b) => {
              const Icon = BADGE_ICON[b.icon] ?? Award;
              return (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm"
                >
                  <Icon className="h-4 w-4 text-brand" />
                  {b.label}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Reports */}
      <div className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Reports ({reports.length})
        </h2>
        {reports.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No reports yet.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {reports.map((i) => (
              <IssueCard key={i.id} issue={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface p-3">
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
