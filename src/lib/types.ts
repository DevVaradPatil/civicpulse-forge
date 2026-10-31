import type { IssueCategory, IssueStatus } from "@/lib/domain";

/** Result of the Triage agent (Gemini, multimodal). */
export interface TriageResult {
  isCivicIssue: boolean;
  category: IssueCategory;
  severity: number; // 1-5
  title: string;
  description: string;
  hazards: string[];
  confidence: number; // 0-1
}

export interface Resolution {
  proofPath: string;
  verified: boolean;
  verifiedAt?: number;
  note?: string;
}

/** Result of the Resolution Verifier agent (Gemini, multimodal before/after). */
export interface VerificationResult {
  resolved: boolean;
  confidence: number; // 0-1
  note: string;
}

/** Result of the Routing agent (Gemini text) — an AI-drafted authority complaint. */
export interface Complaint {
  subject: string;
  body: string;
  priority: string;
  slaEstimate: string;
  /** Real agency code the issue is routed to, derived from the source data. */
  agency: string | null;
  generatedAt: number;
}

/** One tool call made by the investigation agent, shown in the UI trace. */
export interface ToolCallTrace {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  /** False when the tool rejected the arguments — the agent then self-corrects. */
  ok: boolean;
  summary: string;
  durationMs: number;
}

export interface InvestigationFinding {
  claim: string;
  /** The tool call this claim came from, e.g. "get_ward_stats(Bellanduru)". */
  source: string;
}

/** Output of the multi-step investigation agent (src/lib/agents/investigate.ts). */
export interface Investigation {
  summary: string;
  findings: InvestigationFinding[];
  recommendedAgency: string | null;
  recommendedAgencyLabel: string | null;
  priority: string;
  complaint: { subject: string; body: string };
  trace: ToolCallTrace[];
  toolCalls: number;
  /** The model that actually answered — the chain falls back when one is out of quota. */
  model?: string;
  durationMs: number;
  generatedAt: number;
}

/** An issue as stored in Supabase / returned to the client. */
export interface Issue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  /** AI triage rating 1-5. Null on ingested official records, which have none. */
  severity: number | null;
  hazards: string[];
  status: IssueStatus;
  lat: number;
  lng: number;
  geohash: string;
  /** Storage object path, served via /api/media/<photoPath>. Null with no photo. */
  photoPath: string | null;
  /** Voice recording, served the same way. Null unless the report was spoken. */
  audioPath?: string | null;
  /** What the citizen said, verbatim, in the language they spoke. */
  transcript?: string | null;
  transcriptLanguage?: string | null;
  confirmations: number;
  confirmedBy?: string[];
  reporterId?: string;
  aiConfidence?: number;
  resolution?: Resolution;
  routing?: Complaint;
  /** Real ward name from the source dataset. */
  ward?: string | null;
  /** Numeric BBMP ward id — the key the boundaries and work orders join on. */
  wardId?: number | null;
  /** Real responsible agency code (e.g. "BBMP"). */
  agency?: string | null;
  /** How the coordinates were obtained: GPS, or a city-centre pin the reporter accepted. */
  locationSource?: "device" | "approximate" | null;
  /** Provenance — set on every ingested record, absent on citizen reports. */
  source?: string | null;
  sourceRecordId?: string | null;
  sourceUrl?: string | null;
  ingestedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardStats {
  total: number;
  resolved: number;
  /** Still outstanding (reported / verified / in progress / re-opened). */
  open: number;
  /** Rejected or closed — excluded from resolutionRate, not counted as either. */
  undecided: number;
  /** Records with no AI severity rating, i.e. every ingested official record. */
  unrated: number;
  officialRecords: number;
  citizenReports: number;
  resolutionRate: number; // 0-1, over decided records only
  byStatus: Record<IssueStatus, number>;
  byCategory: Record<IssueCategory, number>;
  bySeverity: { low: number; med: number; high: number; critical: number };
  /** The span the data itself covers (epoch ms), not a wall-clock window. */
  window: { start: number | null; end: number | null };
  /** Volume per calendar month, ending at the most recent record. */
  trend: { label: string; count: number }[];
}

export interface AgencyStat {
  /** Null when the source never assigned an agency. */
  agency: string | null;
  total: number;
  resolved: number;
  open: number;
  undecided: number;
  resolutionRate: number; // 0-1
}

/** Recorded BBMP spend for one ward, from the published work orders. */
export interface WardSpend {
  wardId: number;
  ward: string | null;
  orders: number;
  /** Rupees, as published. */
  totalAmount: number;
  medianAmount: number;
}

/** Ward stats keyed by the source's numeric ward_id, for shading boundaries. */
export interface WardChoropleth {
  wardId: number;
  ward: string | null;
  total: number;
  resolved: number;
  open: number;
  /** Null when nothing in this ward has been decided either way. */
  resolutionRate: number | null;
}

export interface WardStat {
  ward: string;
  total: number;
  resolved: number;
  open: number;
  resolutionRate: number; // 0-1
}

/** Provenance of the ingested data, written by scripts/ingest-opencity.mjs. */
export interface IngestProvenance {
  source: string;
  datasetUrl: string;
  resourceId: string;
  resourceName: string;
  license: string;
  attribution: string;
  sourceLastModified: string;
  sourceTotal: number;
  fetched: number;
  written: number;
  skipped: number;
  rowsInDb?: number;
  ingestedAt: number;
  durationMs: number;
}

export interface Hotspot {
  cell: string; // geohash prefix
  /** Ward most of the cluster's records belong to — a name a reader recognises. */
  ward?: string | null;
  lat: number;
  lng: number;
  count: number;
  openCount: number;
  topCategory: IssueCategory;
}

export interface Insights {
  summary: string;
  predictions: string[];
  generatedAt: number;
}

export interface LeaderUser {
  uid: string;
  displayName: string;
  photoURL?: string;
  points: number;
  reportCount: number;
  confirmCount: number;
  resolveCount: number;
}

export type NewIssueInput = {
  /** A report carries a photo, a voice recording, or both. */
  imageBase64?: string;
  audioBase64?: string;
  audioMimeType?: string;
  transcript?: string;
  transcriptLanguage?: string;
  mimeType: string;
  lat: number;
  lng: number;
  triage: TriageResult;
  reporterId?: string;
  reporterName?: string;
  locationSource?: "device" | "approximate";
};
