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
  department: string;
  generatedAt: number;
}

/** An issue as stored in Firestore / returned to the client. */
export interface Issue {
  id: string;
  title: string;
  description: string;
  category: IssueCategory;
  severity: number;
  hazards: string[];
  status: IssueStatus;
  lat: number;
  lng: number;
  geohash: string;
  /** GCS object path, served via /api/media/<photoPath> */
  photoPath: string;
  confirmations: number;
  confirmedBy?: string[];
  reporterId?: string;
  aiConfidence?: number;
  resolution?: Resolution;
  routing?: Complaint;
  createdAt: number;
  updatedAt: number;
}

export interface DashboardStats {
  total: number;
  resolved: number;
  resolutionRate: number; // 0-1
  byStatus: Record<IssueStatus, number>;
  byCategory: Record<IssueCategory, number>;
  bySeverity: { low: number; med: number; high: number; critical: number };
  last7Days: number;
  trend7: { label: string; count: number }[];
}

export interface Hotspot {
  cell: string; // geohash prefix
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
  imageBase64: string;
  mimeType: string;
  lat: number;
  lng: number;
  triage: TriageResult;
  reporterId?: string;
  reporterName?: string;
};
