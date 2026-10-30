// CivicPulse shared domain model — categories, statuses, severity, Delhi config.

export type IssueCategory =
  | "pothole"
  | "water_leak"
  | "streetlight"
  | "waste"
  | "other";

export type IssueStatus = "reported" | "verified" | "in_progress" | "resolved";

export interface CategoryMeta {
  id: IssueCategory;
  label: string;
  /** lucide-react icon name */
  icon: string;
  /** Responsible authority for the Routing agent (Delhi context). */
  department: string;
}

export const CATEGORIES: Record<IssueCategory, CategoryMeta> = {
  pothole: {
    id: "pothole",
    label: "Pothole / Road",
    icon: "TriangleAlert",
    department: "Public Works Department (PWD), Delhi",
  },
  water_leak: {
    id: "water_leak",
    label: "Water Leak",
    icon: "Droplets",
    department: "Delhi Jal Board",
  },
  streetlight: {
    id: "streetlight",
    label: "Streetlight",
    icon: "Lightbulb",
    department: "Municipal Corporation of Delhi (MCD) — Electrical",
  },
  waste: {
    id: "waste",
    label: "Waste / Garbage",
    icon: "Trash2",
    department: "Municipal Corporation of Delhi (MCD) — Sanitation",
  },
  other: {
    id: "other",
    label: "Other",
    icon: "CircleHelp",
    department: "Municipal Corporation of Delhi (MCD)",
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export interface StatusMeta {
  id: IssueStatus;
  label: string;
  /** token suffix → bg-status-* */
  token: string;
}

export const STATUSES: Record<IssueStatus, StatusMeta> = {
  reported: { id: "reported", label: "Reported", token: "status-reported" },
  verified: { id: "verified", label: "Verified", token: "status-verified" },
  in_progress: { id: "in_progress", label: "In Progress", token: "status-progress" },
  resolved: { id: "resolved", label: "Resolved", token: "status-resolved" },
};

export const STATUS_ORDER: IssueStatus[] = [
  "reported",
  "verified",
  "in_progress",
  "resolved",
];

/** Community confirmations needed to auto-advance Reported → Verified. */
export const CONFIRMATIONS_TO_VERIFY = 3;

/** Severity 1-5 → label + color token (bg-sev-*). */
export function severityMeta(severity: number): { label: string; token: string } {
  if (severity >= 5) return { label: "Critical", token: "sev-critical" };
  if (severity >= 4) return { label: "High", token: "sev-high" };
  if (severity >= 3) return { label: "Medium", token: "sev-med" };
  return { label: "Low", token: "sev-low" };
}

// Demo scope: Delhi.
export const DELHI = {
  name: "Delhi",
  center: { lat: 28.6139, lng: 77.209 } as const,
  defaultZoom: 12,
};
