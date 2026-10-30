import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-side Supabase client using the SERVICE ROLE key.
// It bypasses RLS, so it must never be imported into client code.
const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const BUCKET = process.env.SUPABASE_BUCKET || "media";

export function supabaseReady(): boolean {
  return Boolean(url && serviceKey);
}

let instance: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (!instance) {
    if (!url || !serviceKey) {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      );
    }
    instance = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return instance;
}

/**
 * Lazily-instantiated admin client. Constructing the real client at module load
 * would crash the production build (env vars aren't present then), so we defer
 * it to the first actual property access.
 */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop: string | symbol) {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const value = c[prop];
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(c) : value;
  },
});
