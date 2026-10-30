import { Fragment } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Camera,
  MapPin,
  ScanSearch,
  Layers,
  Building2,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  ListChecks,
  CheckCircle2,
  Flame,
  RotateCcw,
  Database,
} from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { IssueCard } from "@/components/issue-card";
import { getDashboard, cityCells } from "@/lib/server/stats";
import { CityScatter } from "@/components/city-scatter";
import { isRealWard } from "@/lib/domain";

export const dynamic = "force-dynamic";

const AGENTS = [
  { icon: ScanSearch, name: "Triage", body: "Reads the photo → category + severity." },
  { icon: Layers, name: "Dedup", body: "Clusters duplicate reports nearby." },
  { icon: Building2, name: "Routing", body: "Drafts the complaint to the right authority." },
  { icon: ShieldCheck, name: "Verify", body: "Confirms the fix from an after-photo." },
  { icon: Sparkles, name: "Insights", body: "Predicts hotspots and trends." },
];

export default async function Home() {
  const [{ stats, hotspots, issues, provenance, agencies, wards }, cells] = await Promise.all([
    getDashboard(),
    cityCells(),
  ]);
  const recent = issues.slice(0, 4);

  // Real counts for the strip below the hero.
  const wardsCovered = wards.filter((w) => isRealWard(w.ward)).length;
  const agenciesTracked = agencies.filter((a) => a.agency).length;
  // Named agencies with enough records for a rate to mean anything, worst first.
  const worstAgencies = agencies
    .filter((a) => a.agency && a.total >= 100)
    .sort((a, b) => a.resolutionRate - b.resolutionRate)
    .slice(0, 6);

  const statCards = [
    { value: stats.total.toLocaleString("en-IN"), label: "Records", icon: ListChecks, accent: "bg-brand/10 text-brand" },
    { value: `${Math.round(stats.resolutionRate * 100)}%`, label: "Resolved", icon: CheckCircle2, accent: "bg-status-resolved/10 text-status-resolved" },
    { value: String(hotspots.length), label: "Hotspots", icon: Flame, accent: "bg-sev-high/10 text-sev-high" },
    { value: (stats.byStatus.reopened ?? 0).toLocaleString("en-IN"), label: "Re-opened", icon: RotateCcw, accent: "bg-status-reopened/10 text-status-reopened" },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4">
      {/* Hero */}
      <section className="py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
              <MapPin className="h-3.5 w-3.5 text-brand" />
              AI-powered civic platform · Bengaluru
            </div>
            <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Bengaluru&rsquo;s civic issues, reported by citizens and{" "}
              <span className="text-brand">resolved with AI</span>.
            </h1>
            <p className="mt-4 max-w-xl text-lg text-muted">
              Snap a pothole, leak, broken light or garbage. An AI agent pipeline
              triages it, routes it to the right authority, tracks it, and verifies the
              fix — while the community confirms and a dashboard predicts where problems
              strike next.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <LinkButton href="/report" className="px-5 py-2.5 text-base">
                <Camera className="h-5 w-5" />
                Report an issue
              </LinkButton>
              <LinkButton href="/map" variant="secondary" className="px-5 py-2.5 text-base">
                Explore the map
              </LinkButton>
            </div>
          </div>

          {/* Hero map. Decorative: the data-drawn view lives further down. */}
          <div className="order-first lg:order-last">
            {/* Line art on a transparent background, so it reads on both themes.
                Height-capped: the source is a tall 2:3 and would otherwise
                dwarf the copy beside it. */}
            <Image
              src="/hero-map.webp"
              alt=""
              aria-hidden
              width={1024}
              height={1536}
              priority
              className="mx-auto h-auto max-h-[380px] w-auto object-contain lg:max-h-[460px]"
            />
          </div>
        </div>

        {/* Live stats */}
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {statCards.map(({ icon: Icon, value, label, accent }) => (
            <div key={label} className="rounded-xl border border-border p-4">
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="mt-3 text-2xl font-semibold">{value}</div>
              <div className="text-sm text-muted">{label}</div>
            </div>
          ))}
        </div>

        {/* Where those numbers come from. */}
        {provenance && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <Database className="h-3.5 w-3.5 shrink-0" />
            Every figure above is counted from{" "}
            <a
              href={provenance.datasetUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-fg underline"
            >
              {provenance.resourceName}
            </a>{" "}
            · {provenance.attribution} · {provenance.license}
          </p>
        )}
      </section>

      {/* Where the records actually are — drawn from their own coordinates */}
      <section className="border-t border-border py-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center">
          <CityScatter cells={cells} total={stats.total} />
          <div>
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Every dot is real
            </h2>
            <p className="mt-3 text-lg">
              Not a stock map. Each dot is a neighbourhood cell holding grievances filed by
              Bengaluru residents, sized by volume and coloured by what people complain about
              there.
            </p>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted">Wards covered</dt>
                <dd className="font-medium tabular-nums">{wardsCovered}</dd>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <dt className="text-muted">Agencies held to account</dt>
                <dd className="font-medium tabular-nums">{agenciesTracked}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Still unresolved</dt>
                <dd className="font-medium tabular-nums">
                  {stats.open.toLocaleString("en-IN")}
                </dd>
              </div>
            </dl>
            <Link
              href="/map"
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
            >
              Open the live map <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Agency accountability — the part that makes this more than a report box */}
      {worstAgencies.length > 0 && (
        <section className="border-t border-border py-14">
          <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
            Who is answering, and who is not
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            Resolution rates counted from the records themselves. Rejected and closed
            grievances are left out of the denominator rather than quietly counted as either.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {worstAgencies.map((a) => (
              <div key={a.agency ?? "unassigned"} className="rounded-xl border border-border p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{a.agency ?? "Unassigned"}</span>
                  <span className="text-lg font-semibold tabular-nums">
                    {Math.round(a.resolutionRate * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-status-resolved"
                    style={{ width: `${Math.round(a.resolutionRate * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {a.resolved.toLocaleString("en-IN")} resolved ·{" "}
                  {a.open.toLocaleString("en-IN")} open
                </p>
              </div>
            ))}
          </div>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            See the full dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      )}

      {/* Agent pipeline */}
      <section className="border-t border-border py-14">
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          A multi-agent pipeline does the work
        </h2>
        <div className="mt-6 flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
          {AGENTS.map(({ icon: Icon, name, body }, i) => (
            <Fragment key={name}>
              <div className="flex-1 rounded-xl border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-brand-fg">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-medium text-muted">Step {i + 1}</span>
                </div>
                <h3 className="mt-3 font-medium">{name}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </div>
              {i < AGENTS.length - 1 && (
                <div className="flex shrink-0 items-center justify-center py-1 text-muted lg:py-0">
                  <ArrowRight className="h-5 w-5 rotate-90 lg:rotate-0" />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </section>

      {/* Live feed */}
      {recent.length > 0 && (
        <section className="border-t border-border py-14">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
              Latest records
            </h2>
            <Link href="/map" className="flex items-center gap-1 text-sm text-brand hover:underline">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {recent.map((i) => (
              <IssueCard key={i.id} issue={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
