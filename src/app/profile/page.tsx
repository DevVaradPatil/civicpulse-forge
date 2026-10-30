"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Check } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ProfileView } from "@/components/profile-view";
import type { Issue, LeaderUser } from "@/lib/types";

export default function ProfilePage() {
  const { uid, loading, displayName, saveDisplayName } = useAuth();
  const [data, setData] = useState<{ profile: LeaderUser; reports: Issue[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    if (!uid) return;
    const r = await fetch(`/api/users/${uid}`);
    if (r.ok) {
      const d = await r.json();
      setData(d);
      setName(d.profile.displayName);
    } else {
      // No profile row yet — the user hasn't earned points.
      setData({
        profile: {
          uid,
          displayName: displayName || "Anonymous",
          points: 0,
          reportCount: 0,
          confirmCount: 0,
          resolveCount: 0,
        },
        reports: [],
      });
      setName(displayName);
    }
  }, [uid, displayName]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    await saveDisplayName(name);
    setEditing(false);
    load();
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading profile…
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto max-w-3xl px-4 pt-8">
        {editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={40}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-1.5 text-sm sm:flex-none"
            />
            <button
              onClick={save}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-brand-fg"
            >
              <Check className="h-4 w-4" /> Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit display name
          </button>
        )}
      </div>
      <ProfileView profile={data.profile} reports={data.reports} />
    </div>
  );
}
