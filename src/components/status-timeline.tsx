import { Fragment } from "react";
import { Check } from "lucide-react";
import { STATUS_ORDER, STATUSES, type IssueStatus } from "@/lib/domain";

export function StatusTimeline({ status }: { status: IssueStatus }) {
  const current = STATUS_ORDER.indexOf(status);
  return (
    <div className="flex items-center">
      {STATUS_ORDER.map((s, i) => {
        const done = i <= current;
        return (
          <Fragment key={s}>
            <div className="flex flex-col items-center gap-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
                  done
                    ? "bg-brand text-brand-fg"
                    : "border border-border bg-surface text-muted"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`text-[11px] ${done ? "text-fg" : "text-muted"}`}>
                {STATUSES[s].label}
              </span>
            </div>
            {i < STATUS_ORDER.length - 1 && (
              <div
                className={`mx-1 mb-5 h-0.5 flex-1 ${
                  i < current ? "bg-brand" : "bg-border"
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
