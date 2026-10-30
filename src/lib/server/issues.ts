import "server-only";
import { geohashForLocation, distanceBetween } from "geofire-common";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { Complaint, Issue, NewIssueInput } from "@/lib/types";
import { uploadImage, decodeImage, downloadFile } from "@/lib/server/storage";
import { verifyResolution, type VerificationResult } from "@/lib/agents/verifier";
import { draftComplaint } from "@/lib/agents/routing";
import { CATEGORIES, CONFIRMATIONS_TO_VERIFY, type IssueCategory } from "@/lib/domain";

/** Dedup agent (deterministic): count same-category issues within ~250m. */
const DUP_RADIUS_KM = 0.25;

const TABLE = "issues";

/** Maps a snake_case Postgres row to our camelCase domain object. */
type Row = Record<string, unknown>;
function rowToIssue(d: Row): Issue {
  return {
    id: String(d.id),
    title: (d.title as string) ?? "",
    description: (d.description as string) ?? "",
    category: d.category as Issue["category"],
    severity: (d.severity as number) ?? 1,
    hazards: (d.hazards as string[]) ?? [],
    status: ((d.status as Issue["status"]) ?? "reported"),
    lat: d.lat as number,
    lng: d.lng as number,
    geohash: (d.geohash as string) ?? "",
    photoPath: (d.photo_path as string) ?? "",
    confirmations: (d.confirmations as number) ?? 0,
    confirmedBy: (d.confirmed_by as string[]) ?? [],
    reporterId: (d.reporter_id as string) ?? undefined,
    aiConfidence: (d.ai_confidence as number) ?? undefined,
    resolution: (d.resolution as Issue["resolution"]) ?? undefined,
    routing: (d.routing as Issue["routing"]) ?? undefined,
    createdAt: Number(d.created_at),
    updatedAt: Number(d.updated_at),
  };
}

export async function createIssue(input: NewIssueInput): Promise<Issue> {
  const { buffer, mimeType } = decodeImage(input.imageBase64, input.mimeType);
  const photoPath = await uploadImage(buffer, mimeType, "issues");

  const now = Date.now();
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert({
      title: input.triage.title,
      description: input.triage.description,
      category: input.triage.category,
      severity: input.triage.severity,
      hazards: input.triage.hazards ?? [],
      status: "reported",
      lat: input.lat,
      lng: input.lng,
      geohash: geohashForLocation([input.lat, input.lng]),
      photo_path: photoPath,
      confirmations: 0,
      confirmed_by: [],
      reporter_id: input.reporterId ?? null,
      reporter_name: input.reporterName ?? null,
      ai_confidence: input.triage.confidence,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return rowToIssue(data);
}

export async function listIssues(limit = 200): Promise<Issue[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToIssue);
}

export async function listIssuesByReporter(uid: string, limit = 100): Promise<Issue[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("reporter_id", uid)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToIssue);
}

export async function getIssue(id: string): Promise<Issue | null> {
  const { data, error } = await supabaseAdmin.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return rowToIssue(data);
}

/** Dedup agent: number of nearby same-category reports (excluding this one). */
export async function countNearbyDuplicates(
  lat: number,
  lng: number,
  category: IssueCategory,
  excludeId: string,
): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("id, lat, lng")
    .eq("category", category);
  if (error || !data) return 0;
  let n = 0;
  for (const row of data) {
    if (String(row.id) === excludeId) continue;
    if (distanceBetween([lat, lng], [row.lat as number, row.lng as number]) <= DUP_RADIUS_KM) n++;
  }
  return n;
}

/** Routing agent (cached): drafts/returns the authority complaint for an issue. */
export async function getOrDraftComplaint(
  id: string,
  force = false,
): Promise<Complaint | null> {
  const issue = await getIssue(id);
  if (!issue) return null;
  if (issue.routing && !force) return issue.routing;

  const drafted = await draftComplaint(issue);
  const complaint: Complaint = {
    ...drafted,
    department: CATEGORIES[issue.category].department,
    generatedAt: Date.now(),
  };
  await supabaseAdmin
    .from(TABLE)
    .update({ routing: complaint, updated_at: Date.now() })
    .eq("id", id);
  return complaint;
}

/** Community confirm. Atomic + idempotent per uid; auto-verifies at the threshold. */
export async function confirmIssue(
  id: string,
  uid?: string,
): Promise<{ issue: Issue; counted: boolean } | null> {
  const { data, error } = await supabaseAdmin.rpc("confirm_issue", {
    p_id: id,
    p_uid: uid ?? null,
    p_threshold: CONFIRMATIONS_TO_VERIFY,
  });
  if (error) throw new Error(error.message);
  if (!data) return null;
  const payload = data as { issue: Row; counted: boolean };
  return { issue: rowToIssue(payload.issue), counted: payload.counted };
}

export async function setInProgress(id: string): Promise<Issue | null> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({ status: "in_progress", updated_at: Date.now() })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) return null;
  return rowToIssue(data);
}

/** Resolve flow: runs the Resolution Verifier agent on before/after photos. */
export async function resolveIssue(
  id: string,
  proofImage: string,
  mimeType: string,
): Promise<{ issue: Issue; verification: VerificationResult } | null> {
  const issue = await getIssue(id);
  if (!issue) return null;

  const before = await downloadFile(issue.photoPath);
  if (!before) throw new Error("original photo not found");
  const beforeMime = issue.photoPath.endsWith(".png") ? "image/png" : "image/jpeg";

  const { buffer: afterBuf, mimeType: afterMime } = decodeImage(proofImage, mimeType);
  const proofPath = await uploadImage(afterBuf, afterMime, "resolutions");

  const verification = await verifyResolution(
    before.buffer.toString("base64"),
    beforeMime,
    afterBuf.toString("base64"),
    afterMime,
    issue.category,
    issue.title,
  );

  const resolution = {
    proofPath,
    verified: verification.resolved,
    verifiedAt: Date.now(),
    note: verification.note,
  };
  const updates: Record<string, unknown> = { resolution, updated_at: Date.now() };
  if (verification.resolved) updates.status = "resolved";

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? "update failed");

  return { issue: rowToIssue(data), verification };
}
