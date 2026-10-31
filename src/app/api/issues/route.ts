import { NextResponse } from "next/server";
import { createIssue, listIssues, countIssues } from "@/lib/server/issues";
import { awardPoints } from "@/lib/server/users";
import { getUserFromRequest } from "@/lib/server/auth";
import type { NewIssueInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Hard ceiling on one response — the table holds tens of thousands of rows.
 * 1000 is also PostgREST's own max-rows, so asking for more would silently
 * return fewer than the limit we reported back.
 */
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 200;
/** ~12 MB of binary, allowing for base64's ~33% overhead. */
const MAX_IMAGE_CHARS = 17_000_000;
/** ~8 MB of audio; a 30s Opus clip is a few hundred KB. */
const MAX_AUDIO_CHARS = 11_000_000;

export async function GET(req: Request) {
  const raw = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isFinite(raw) && raw > 0 ? Math.min(Math.trunc(raw), MAX_LIMIT) : DEFAULT_LIMIT;
  try {
    // `total` is the real row count, so a caller can say "N of TOTAL" instead of
    // presenting the page size as if it were the whole dataset.
    const [issues, total] = await Promise.all([listIssues(limit), countIssues()]);
    return NextResponse.json({ issues, total, limit });
  } catch (err) {
    console.error("list issues failed", err);
    return NextResponse.json({ error: "Could not load issues." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: NewIssueInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // A report carries a photo, a voice recording, or both.
  if (!body.imageBase64 && !body.audioBase64) {
    return NextResponse.json(
      { error: "A report needs either imageBase64 or audioBase64." },
      { status: 400 },
    );
  }
  if (typeof body.lat !== "number" || typeof body.lng !== "number" || !body.triage) {
    return NextResponse.json({ error: "lat, lng and triage are required." }, { status: 400 });
  }

  // Never trust the client: a coordinate off the globe would land on the map
  // as a real pin, and an oversized payload would be rejected downstream
  // with a far less useful error.
  if (
    !Number.isFinite(body.lat) ||
    !Number.isFinite(body.lng) ||
    Math.abs(body.lat) > 90 ||
    Math.abs(body.lng) > 180
  ) {
    return NextResponse.json(
      { error: "lat must be between -90 and 90, and lng between -180 and 180." },
      { status: 400 },
    );
  }
  if ((body.imageBase64?.length ?? 0) > MAX_IMAGE_CHARS) {
    return NextResponse.json(
      { error: "That photo is too large. Please use one under 12 MB." },
      { status: 413 },
    );
  }
  // 30s of Opus is well under this; anything bigger is not a voice report.
  if ((body.audioBase64?.length ?? 0) > MAX_AUDIO_CHARS) {
    return NextResponse.json({ error: "That recording is too large." }, { status: 413 });
  }

  const authed = await getUserFromRequest(req);
  const reporterId = authed?.uid ?? body.reporterId;
  const reporterName = body.reporterName ?? authed?.name;

  // Only the two values the column is documented to hold.
  const locationSource = body.locationSource === "approximate" ? "approximate" : "device";

  try {
    const issue = await createIssue({ ...body, reporterId, locationSource });
    await awardPoints(reporterId, reporterName, "report");
    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    console.error("create issue failed", err);
    return NextResponse.json({ error: "Could not save the report." }, { status: 500 });
  }
}
