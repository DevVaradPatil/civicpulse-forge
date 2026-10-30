import Link from "next/link";
import { Activity, Map, Plus, LayoutDashboard, Trophy, User } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/map", label: "Map", icon: Map },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand text-brand-fg">
            <Activity className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="hidden min-[380px]:inline">CivicPulse</span>
        </Link>

        <nav className="flex items-center gap-0.5 sm:gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              title={label}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}
          <LinkButton href="/report" className="ml-0.5 px-3 sm:ml-1">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Report</span>
          </LinkButton>
          <ThemeToggle />
          <Link
            href="/profile"
            title="My profile"
            className="inline-flex items-center rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-surface hover:text-fg"
          >
            <User className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
