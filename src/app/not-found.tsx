import Link from "next/link";
import { SearchX, Home, Map } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-surface text-muted">
        <SearchX className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-muted">
        This page or record does not exist. It may have been removed, or the link may be wrong.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
        <Link
          href="/map"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          <Map className="h-4 w-4" />
          Browse the map
        </Link>
      </div>
    </div>
  );
}
