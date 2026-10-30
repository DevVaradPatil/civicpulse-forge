import { NextResponse } from "next/server";
import { createIssue, listIssues } from "@/lib/server/issues";
import { awardPoints } from "@/lib/server/users";
import { getUserFromRequest } from "@/lib/server/auth";
import type { NewIssueInput } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const issues = await listIssues();
    return NextResponse.json({ issues });
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
