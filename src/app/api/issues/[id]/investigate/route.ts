import { NextResponse } from "next/server";
import { getIssue } from "@/lib/server/issues";
import { investigateIssue } from "@/lib/agents/investigate";
import { geminiReady } from "@/lib/server/gemini";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { Investigation } from "@/lib/types";

export const runtime = "nodejs";
// The agent makes several model round-trips; give it room.
export const maxDuration = 60;

const cacheKey = (id: string) => `investigation:${id}`;

/** Cached in `meta` so re-opening an issue (or a demo re-run) costs nothing. */
async function readCache(id: string): Promise<Investigation | null> {
  const { data, error } = await supabaseAdmin
    .from("meta")
    .select("value")
    .eq("key", cacheKey(id))
    .maybeSingle();
  if (error || !data?.value) return null;
  return data.value as Investigation;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const force = new URL(req.url).searchParams.get("refresh") === "1";

  if (!geminiReady()) {
    return NextResponse.json(
      { error: "The AI service is not configured, so no investigation can be run." },
      { status: 503 },
    );
  }

  const issue = await getIssue(id).catch(() => null);
  if (!issue) {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  }

  if (!force) {
    const cached = await readCache(id);
    if (cached) return NextResponse.json({ investigation: cached, cached: true });
  }

  try {
    const investigation = await investigateIssue(issue);
    // Cache failures must not fail the request — the result is already good.
    const { error } = await supabaseAdmin
      .from("meta")
      .upsert({ key: cacheKey(id), value: investigation });
    if (error) console.error("could not cache investigation:", error.message);
    return NextResponse.json({ investigation, cached: false });
  } catch (err) {
    console.error("investigation failed", err);
    const msg = String(err instanceof Error ? err.message : err);
    // A model overload is temporary and worth retrying; say so rather than
    // showing a generic failure.
    const overloaded = /503|UNAVAILABLE|overload|high demand|429|RESOURCE_EXHAUSTED/i.test(msg);
    return NextResponse.json(
      {
        error: overloaded
          ? "The AI service is busy right now. Try again in a moment."
          : "The investigation could not be completed.",
      },
      { status: overloaded ? 503 : 500 },
    );
  }
}
