import { NextResponse } from "next/server";
import { createIssue, listIssues, countIssues } from "@/lib/server/issues";
import { awardPoints } from "@/lib/server/users";
import { getUserFromRequest } from "@/lib/server/auth";
import type { NewIssueInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Hard ceiling on one response — the table holds tens of thousands of rows. */
const MAX_LIMIT = 3000;
const DEFAULT_LIMIT = 200;

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

  if (!body.imageBase64 || typeof body.lat !== "number" || typeof body.lng !== "number" || !body.triage) {
    return NextResponse.json(
      { error: "imageBase64, lat, lng and triage are required." },
      { status: 400 },
    );
  }

  const authed = await getUserFromRequest(req);
  const reporterId = authed?.uid ?? body.reporterId;
  const reporterName = body.reporterName ?? authed?.name;

  try {
    const issue = await createIssue({ ...body, reporterId });
    await awardPoints(reporterId, reporterName, "report");
    return NextResponse.json({ issue }, { status: 201 });
  } catch (err) {
    console.error("create issue failed", err);
    return NextResponse.json({ error: "Could not save the report." }, { status: 500 });
  }
}
