import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { LeaderUser } from "@/lib/types";

const TABLE = "users";

export type PointAction = "report" | "confirm" | "resolve";

export const POINTS: Record<PointAction, number> = {
  report: 10,
  confirm: 5,
  resolve: 20,
};

/** Upserts a user and atomically increments points + the action counter (Postgres RPC). */
export async function awardPoints(
  uid: string | undefined,
  displayName: string | undefined,
  action: PointAction,
): Promise<void> {
  if (!uid) return;
  const { error } = await supabaseAdmin.rpc("award_points", {
    p_uid: uid,
    p_name: displayName ?? null,
    p_action: action,
  });
  if (error) console.error("awardPoints failed", error.message);
}

type Row = Record<string, unknown>;
function toUser(x: Row): LeaderUser {
  return {
    uid: String(x.uid),
    displayName: (x.display_name as string) ?? "Anonymous",
    photoURL: (x.photo_url as string) ?? undefined,
    points: (x.points as number) ?? 0,
    reportCount: (x.report_count as number) ?? 0,
    confirmCount: (x.confirm_count as number) ?? 0,
    resolveCount: (x.resolve_count as number) ?? 0,
  };
}

export async function getLeaderboard(limit = 20): Promise<LeaderUser[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .order("points", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toUser);
}

export async function getUser(uid: string): Promise<LeaderUser | null> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("uid", uid).maybeSingle();
  if (error || !data) return null;
  return toUser(data);
}

/** Upserts a profile's display name / photo without disturbing points. */
export async function ensureProfile(
  uid: string,
  displayName?: string | null,
  photoURL?: string | null,
): Promise<void> {
  const patch: Record<string, unknown> = { uid, updated_at: Date.now() };
  if (displayName) patch.display_name = displayName.slice(0, 40);
  if (photoURL) patch.photo_url = photoURL;
  const { error } = await supabaseAdmin.from(TABLE).upsert(patch, { onConflict: "uid" });
  if (error) console.error("ensureProfile failed", error.message);
}
