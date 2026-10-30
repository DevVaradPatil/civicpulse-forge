import type { LucideIcon } from "lucide-react";

export function PageStub({
  icon: Icon,
  title,
  phase,
  children,
}: {
  icon: LucideIcon;
  title: string;
  phase: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand text-brand-fg">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted">{phase}</p>
        </div>
      </div>
      <div className="mt-8 rounded-lg border border-border bg-surface p-6 text-muted">
        {children}
      </div>
    </div>
  );
}
