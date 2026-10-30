"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Trophy, Loader2, Camera, ThumbsUp, ShieldCheck, Award } from "lucide-react";
import { tierFor } from "@/lib/badges";
import type { LeaderUser } from "@/lib/types";

const MEDAL = ["#f59e0b", "#94a3b8", "#b45309"]; // gold, silver, bronze

function Avatar({ u, size = 40 }: { u: LeaderUser; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface font-medium"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {u.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.photoURL} alt="" className="h-full w-full object-cover" />
      ) : (
        (u.displayName || "U").charAt(0).toUpperCase()
      )}
    </span>
  );
}

function Counts({ u }: { u: LeaderUser }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted">
      <span className="flex items-center gap-1"><Camera className="h-3.5 w-3.5" /> {u.reportCount}</span>
      <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> {u.confirmCount}</span>
      <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> {u.resolveCount}</span>
    </div>
  );
}

export default function LeaderboardPage() {
  const [users, setUsers] = useState<LeaderUser[] | null>(null);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setUsers(d.users ?? []))
      .catch(() => setUsers([]));
  }, []);

  const top = users?.slice(0, 3) ?? [];
  const rest = users?.slice(3) ?? [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-fg">
          <Trophy className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Community heroes</h1>
          <p className="text-sm text-muted">
            Earn points for reporting, confirming, and verified fixes
            {users ? ` · ${users.length} citizens` : ""}.
          </p>
        </div>
      </div>

      {users === null ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : users.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center text-muted">
          No heroes yet. Report or confirm an issue to get on the board.
        </div>
      ) : (
        <>
          {/* Podium */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {top.map((u, i) => (
              <Link
                key={u.uid}
                href={`/u/${u.uid}`}
                className={`flex flex-col items-center rounded-xl border p-5 text-center transition-colors hover:bg-surface ${
                  i === 0 ? "border-brand ring-1 ring-brand sm:-mt-2" : "border-border"
                }`}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ background: MEDAL[i] }}
                >
                  {i + 1}
                </span>
                <div className="mt-3">
                  <Avatar u={u} size={56} />
                </div>
                <p className="mt-2 truncate font-medium">{u.displayName}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  <Award className="h-3 w-3" /> {tierFor(u.points).name}
                </span>
                <div className="mt-2 text-2xl font-semibold">{u.points}</div>
                <div className="text-xs text-muted">points</div>
                <div className="mt-3">
                  <Counts u={u} />
                </div>
              </Link>
            ))}
          </div>

          {/* Rest */}
          {rest.length > 0 && (
            <div className="mt-4 space-y-2">
              {rest.map((u, i) => (
                <Link
                  key={u.uid}
                  href={`/u/${u.uid}`}
                  className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-surface"
                >
                  <span className="w-6 text-center text-sm font-semibold text-muted">{i + 4}</span>
                  <Avatar u={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.displayName}</p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs">
                      <span className="font-medium text-brand">{tierFor(u.points).name}</span>
                    </div>
                  </div>
                  <span className="text-lg font-semibold">{u.points}</span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
