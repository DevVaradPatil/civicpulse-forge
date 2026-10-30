import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase";

export interface AuthedUser {
  uid: string;
  name?: string;
  picture?: string;
}

/** Verifies the Supabase access token from the Authorization header. Null if absent/invalid. */
export async function getUserFromRequest(req: Request): Promise<AuthedUser | null> {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(match[1]);
    if (error || !data.user) return null;
    const meta = data.user.user_metadata ?? {};
    return {
      uid: data.user.id,
      name: (meta.full_name as string) || (meta.name as string) || undefined,
      picture: (meta.avatar_url as string) || undefined,
    };
  } catch {
    return null;
  }
}
