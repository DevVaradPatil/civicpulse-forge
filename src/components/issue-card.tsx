import Link from "next/link";
import { SeverityBadge, StatusBadge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/ui/category-icon";
import { CATEGORIES } from "@/lib/domain";
import { timeAgo } from "@/lib/format";
import type { Issue } from "@/lib/types";

export function IssueCard({ issue }: { issue: Issue }) {
  return (
    <Link
      href={`/issue/${issue.id}`}
      className="flex min-w-0 gap-3 rounded-lg border border-border p-3 hover:bg-surface"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/media/${issue.photoPath}`}
        alt=""
        className="h-16 w-16 shrink-0 rounded-md border border-border object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <CategoryIcon category={issue.category} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{CATEGORIES[issue.category].label}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">{timeAgo(issue.createdAt)}</span>
        </div>
        <p className="mt-0.5 truncate font-medium">{issue.title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <SeverityBadge severity={issue.severity} />
          <StatusBadge status={issue.status} />
        </div>
      </div>
    </Link>
  );
}
