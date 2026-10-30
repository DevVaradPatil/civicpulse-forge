"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase, supabaseConfigured } from "@/lib/client/supabase";

const NAME_KEY = "cp_name";

interface AuthCtx {
  user: User | null;
  uid: string | null;
  loading: boolean;
  /** Display name shown on the leaderboard/profile (optional, user-chosen). */
  displayName: string;
  saveDisplayName: (name: string) => Promise<void>;
  authedFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    setDisplayName(localStorage.getItem(NAME_KEY) ?? "");

    const supabase = getSupabase();
    if (!supabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session?.user) {
        setUser(data.session.user);
        setLoading(false);
        return;
      }
      // Every visitor gets a stable anonymous identity so they can participate
      // instantly — no login required.
      const { data: signed, error } = await supabase.auth.signInAnonymously();
      if (cancelled) return;
      if (error) console.error("anonymous sign-in failed", error.message);
      setUser(signed?.user ?? null);
      setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const authedFetch = useCallback(async (input: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    const supabase = getSupabase();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers });
  }, []);

  const saveDisplayName = useCallback(
    async (name: string) => {
      const clean = name.trim().slice(0, 40);
      setDisplayName(clean);
      localStorage.setItem(NAME_KEY, clean);
      if (!clean) return;
      await authedFetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: clean }),
      });
    },
    [authedFetch],
  );

  return (
    <Ctx.Provider
      value={{
        user,
        uid: user?.id ?? null,
        loading,
        displayName,
        saveDisplayName,
        authedFetch,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
