import "server-only";
import { geohashForLocation, distanceBetween } from "geofire-common";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { Complaint, Issue, NewIssueInput } from "@/lib/types";
import { uploadImage, uploadAudio, decodeImage, downloadFile } from "@/lib/server/storage";
import { verifyResolution, type VerificationResult } from "@/lib/agents/verifier";
import { draftComplaint } from "@/lib/agents/routing";
import { resolveAgency } from "@/lib/server/agencies";
import { CONFIRMATIONS_TO_VERIFY, PHOTO_SOURCE, type IssueCategory } from "@/lib/domain";

/** Dedup agent (deterministic): count same-category issues within ~250m. */
const DUP_RADIUS_KM = 0.25;

const TABLE = "issues";

/** Maps a snake_case Postgres row to our camelCase domain object. */
type Row = Record<string, unknown>;

/** The source record carries the numeric ward id; citizen reports do not. */
function wardIdFrom(payload: unknown): number | null {
  const raw = (payload as { ward_id?: unknown } | null)?.ward_id;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Public photo records carry their photographer and licence in the source
 * payload; so do demo seed reports that reuse one of those photos.
 */
function photoCreditFrom(d: Row): Issue["photoCredit"] {
  if (d.source !== PHOTO_SOURCE && d.seed !== true) return null;
  const p = (d.source_payload ?? {}) as Record<string, unknown>;
  if (!p.artist || !p.license) return null;
  return {
    author: String(p.artist),
    license: String(p.license),
    licenseUrl: (p.licenseUrl as string) ?? null,
    pageUrl: (d.source_url as string) ?? null,
  };
}

function rowToIssue(d: Row): Issue {
  return {
    id: String(d.id),
    title: (d.title as string) ?? "",
    description: (d.description as string) ?? "",
    category: d.category as Issue["category"],
    // Null stays null: ingested official records have no severity to show.
    severity: d.severity == null ? null : Number(d.severity),
    hazards: (d.hazards as string[]) ?? [],
    status: ((d.status as Issue["status"]) ?? "reported"),
    lat: d.lat as number,
    lng: d.lng as number,
    geohash: (d.geohash as string) ?? "",
    photoPath: (d.photo_path as string) ?? null,
    audioPath: (d.audio_path as string) ?? null,
    transcript: (d.transcript as string) ?? null,
    transcriptLanguage: (d.transcript_lang as string) ?? null,
    confirmations: (d.confirmations as number) ?? 0,
    confirmedBy: (d.confirmed_by as string[]) ?? [],
    reporterId: (d.reporter_id as string) ?? undefined,
    aiConfidence: (d.ai_confidence as number) ?? undefined,
    resolution: (d.resolution as Issue["resolution"]) ?? undefined,
    routing: (d.routing as Issue["routing"]) ?? undefined,
    ward: (d.ward as string) ?? null,
    wardId: wardIdFrom(d.source_payload),
    agency: (d.agency as string) ?? null,
    locationSource: (d.location_source as Issue["locationSource"]) ?? null,
    photoCredit: photoCreditFrom(d),
    source: (d.source as string) ?? null,
    sourceRecordId: (d.source_record_id as string) ?? null,
    sourceUrl: (d.source_url as string) ?? null,
    ingestedAt: d.ingested_at == null ? null : Number(d.ingested_at),
    createdAt: Number(d.created_at),
    updatedAt: Number(d.updated_at),
  };
}

export async function createIssue(input: NewIssueInput): Promise<Issue> {
  // A report carries a photo, a voice recording, or both.
  let photoPath: string | null = null;
  if (input.imageBase64) {
    const { buffer, mimeType } = decodeImage(input.imageBase64, input.mimeType);
    photoPath = await uploadImage(buffer, mimeType, "issues");
  }

  let audioPath: string | null = null;
  if (input.audioBase64) {
    const match = input.audioBase64.match(/^data:(.+?);base64,(.*)$/s);
    const audioMime = match?.[1] ?? input.audioMimeType ?? "audio/webm";
    const audioData = match?.[2] ?? input.audioBase64;
    audioPath = await uploadAudio(Buffer.from(audioData, "base64"), audioMime);
  }

  if (!photoPath && !audioPath) {
    throw new Error("A report needs a photo or a voice recording.");
  }

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
      audio_path: audioPath,
      // The citizen's own words, kept verbatim in the language they spoke.
      transcript: input.transcript ?? null,
      transcript_lang: input.transcriptLanguage ?? null,
      confirmations: 0,
      confirmed_by: [],
      reporter_id: input.reporterId ?? null,
      reporter_name: input.reporterName ?? null,
      // Recorded so an approximate pin is never presented as a GPS fix.
      location_source: input.locationSource ?? "device",
      ai_confidence: input.triage.confidence,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error || !data) throw new Error(error?.message ?? "insert failed");
  return rowToIssue(data);
}

/** Total rows, for honest "showing N of TOTAL" labels. */
export async function countIssues(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from(TABLE)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
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

/**
 * Every record that has a photo (citizen reports and public photo records).
 * They are a few dozen among tens of thousands, so a newest-N window would
 * leave most of them off the map.
 */
export async function listPhotoIssues(limit = 500): Promise<Issue[]> {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .not("photo_path", "is", null)
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

  const { agency } = await resolveAgency(issue);
  const drafted = await draftComplaint(issue);
  const complaint: Complaint = {
    ...drafted,
    agency,
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

  // Before/after verification needs a "before" photo, which official open-data
  // records do not have.
  if (!issue.photoPath) {
    throw new Error("This record has no original photo, so a fix cannot be visually verified.");
  }
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
