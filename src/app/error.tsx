"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert, RefreshCw, Home } from "lucide-react";

/**
 * Route-level error boundary. A failed data fetch shows this instead of a
 * blank page or, worse, a page of zeros that would read as real figures.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sev-high/10 text-sev-high">
        <TriangleAlert className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">
        This page could not load its data. Nothing is shown rather than figures that might be
        wrong or out of date.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted">Reference: {error.digest}</p>
      )}
      <div className="mt-6 flex justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-brand-fg hover:bg-brand-hover"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          <Home className="h-4 w-4" />
          Home
        </Link>
      </div>
    </div>
  );
}
