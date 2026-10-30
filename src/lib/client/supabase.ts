"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser client. Uses the public anon key (safe to expose — every table has
// RLS enabled with no policies, so this key can't read or write data directly).
// It is used only for anonymous auth; all data flows through our own /api/* routes.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null;
  if (!client) {
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}
