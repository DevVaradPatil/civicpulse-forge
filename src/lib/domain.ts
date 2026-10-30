// CivicPulse shared domain model — categories, statuses, severity, Bengaluru config.
//
// Everything in this file that names a real-world category, status or agency is
// taken verbatim from the source dataset:
//
//   I Change My City Complaints Log 2019-2022 (Janaagraha iCMyC), published on
//   OpenCity — https://data.opencity.in/dataset/i-change-my-city-data
//   resource a60abf5c-3a15-4967-af32-c3074248580f, 16,071 records.
//
// Nothing here is invented. The category families below are groupings of the
// dataset's own `category_title` values (listed per family in `sourceValues`),
// and the agencies are the dataset's own `civic_agency_title` values. Where the
// dataset only ever gives an acronym, only the acronym is recorded — a full
// agency name is never guessed.

export type IssueCategory =
  | "pothole"
  | "waste"
  | "streetlight"
  | "water_leak"
  | "sewerage"
  | "stormwater"
  | "traffic"
  | "animals"
  | "pollution"
  | "electricity"
  | "safety"
  | "parks"
  | "transport"
  | "civic_services"
  | "other";

/**
 * Statuses. The first four are the citizen-report lifecycle; `reopened`,
 * `closed` and `rejected` exist because the source dataset uses them, and
 * collapsing them into `resolved` would misstate every resolution rate we show.
 */
export type IssueStatus =
  | "reported"
  | "verified"
  | "in_progress"
  | "resolved"
  | "reopened"
  | "closed"
  | "rejected";

export interface CategoryMeta {
  id: IssueCategory;
  label: string;
  /** lucide-react icon name */
  icon: string;
  /** The dataset's own `category_title` values that fall under this family. */
  sourceValues: string[];
}

export const CATEGORIES: Record<IssueCategory, CategoryMeta> = {
  pothole: {
    id: "pothole",
    label: "Roads & Footpaths",
    icon: "TriangleAlert",
    sourceValues: [
      "Mobility - Roads, Footpaths and Infrastructure",
      "Roads and Footpaths",
      "Mobility - Roads, Public transport",
      "PWD",
    ],
  },
  waste: {
    id: "waste",
    label: "Waste & Sanitation",
    icon: "Trash2",
    sourceValues: [
      "Garbage and Unsanitary Practices",
      "Yellow Spot",
      "Public Toilets",
      "Solid Waste Management",
      "Waste Management",
    ],
  },
  streetlight: {
    id: "streetlight",
    label: "Streetlights",
    icon: "Lightbulb",
    sourceValues: ["Street lighting", "Streetlights"],
  },
  water_leak: {
    id: "water_leak",
    label: "Water Supply",
    icon: "Droplets",
    sourceValues: ["Water Supply and Services", "Water Supply"],
  },
  sewerage: {
    id: "sewerage",
    label: "Sewerage",
    icon: "Waves",
    sourceValues: ["Sewerage Systems", "Sanitation"],
  },
  stormwater: {
    id: "stormwater",
    label: "Storm Water Drains",
    icon: "CloudRain",
    sourceValues: ["Storm Water Drains"],
  },
  traffic: {
    id: "traffic",
    label: "Traffic & Road Safety",
    icon: "TrafficCone",
    sourceValues: ["Traffic and Road Safety"],
  },
  animals: {
    id: "animals",
    label: "Stray Animals",
    icon: "Dog",
    sourceValues: ["Animal Husbandry", "Animal Catcher"],
  },
  pollution: {
    id: "pollution",
    label: "Pollution",
    icon: "Factory",
    sourceValues: ["Pollution", "Fire Pollution"],
  },
  electricity: {
    id: "electricity",
    label: "Electricity",
    icon: "Zap",
    sourceValues: ["Electricity and Power Supply", "Electricity & Power", "Power supply"],
  },
  safety: {
    id: "safety",
    label: "Crime & Safety",
    icon: "ShieldAlert",
    sourceValues: ["Crime and Safety", "Safety and Crime", "Fire Safety"],
  },
  parks: {
    id: "parks",
    label: "Parks, Trees & Lakes",
    icon: "Trees",
    sourceValues: [
      "Parks & Recreation",
      "Trees and Saplings",
      "Lakes",
      "Playgrounds",
      "Parks & Garden",
    ],
  },
  transport: {
    id: "transport",
    label: "Public Transport",
    icon: "Bus",
    sourceValues: [
      "Public Transport - BMTC",
      "Public transport (BMTC and Metro)",
      "Public Transport - KSRTC",
    ],
  },
  civic_services: {
    id: "civic_services",
    label: "Civic Services",
    icon: "Building2",
    sourceValues: [
      "Community Infrastructure and Services",
      "Certificates",
      "Covid 19",
      "Pension",
      "Ration Card",
      "EMP Grievance Redressal",
      "Proibition & Sale of Tobacco products, Plastic carry bags",
    ],
  },
  other: {
    id: "other",
    label: "Other",
    icon: "CircleHelp",
    sourceValues: ["Others"],
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

/** Reverse index: the dataset's `category_title` → our category family. */
const SOURCE_CATEGORY_INDEX: Record<string, IssueCategory> = Object.fromEntries(
  CATEGORY_LIST.flatMap((c) => c.sourceValues.map((v) => [v.toLowerCase(), c.id])),
);

/**
 * A few of the dataset's `sub_category_title` values sit under a parent
 * `category_title` that does not describe them. "Yellow Spot" is BBMP's
 * campaign label rather than a topic: of its 948 records, ~627 really are
 * sanitation (public urination, garbage on footpaths, public toilets) but ~315
 * are footpath repair or construction. The sub-category is the more specific
 * fact the source gives us, so for these exact strings it wins.
 *
 * Deliberately narrow: every other large category was checked and its
 * sub-categories all belong to their parent, so they are left alone.
 */
const SOURCE_SUBCATEGORY_OVERRIDES: Record<string, IssueCategory> = {
  "report a broken footpath": "pothole",
  "2b- repair broken footpath": "pothole",
  "require a new footpath": "pothole",
  "2a- require new footpath": "pothole",
  "3a- require playing and gym equipment": "parks",
};

/**
 * Maps a source `category_title` onto our taxonomy, letting a more specific
 * `sub_category_title` override it where the parent is known to be mixed. An
 * unrecognised or missing value falls back to `other` — the raw strings are
 * always kept on the row's `source_payload`, so nothing is lost.
 */
export function categoryFromSource(
  sourceCategory: string | null | undefined,
  sourceSubCategory?: string | null,
): IssueCategory {
  const sub = sourceSubCategory?.trim().toLowerCase();
  if (sub && sub in SOURCE_SUBCATEGORY_OVERRIDES) {
    return SOURCE_SUBCATEGORY_OVERRIDES[sub];
  }
  if (!sourceCategory) return "other";
  return SOURCE_CATEGORY_INDEX[sourceCategory.trim().toLowerCase()] ?? "other";
}

// ------------------------------------------------------------------ agencies

export interface AgencyMeta {
  /** The acronym as the dataset writes it. */
  code: string;
  /**
   * Expanded name — present only where the dataset itself spells it out
   * somewhere in `civic_agency_title`. Never guessed.
   */
  name?: string;
}

/**
 * Every distinct `civic_agency_title` in the dataset, collapsed onto its
 * acronym. Both the acronym and the long form occur in the data (e.g. 12,824
 * rows say "BBMP" and 101 say "Bruhat Bengaluru Mahanagara Palike"), so the
 * aliases below are the dataset's own spellings, not additions.
 */
export const AGENCIES: Record<string, AgencyMeta> = {
  BBMP: { code: "BBMP", name: "Bruhat Bengaluru Mahanagara Palike" },
  BWSSB: { code: "BWSSB", name: "Bangalore Water Supply And Sewerage Board" },
  BTP: { code: "BTP", name: "Bangalore Traffic Police" },
  KSPCB: { code: "KSPCB", name: "Karnataka State Pollution Control Board" },
  BESCOM: { code: "BESCOM", name: "Bangalore Electricity Supply Company" },
  // The dataset only ever uses the acronym for these, so no expansion is recorded.
  BCP: { code: "BCP" },
  BMTC: { code: "BMTC" },
  KSFES: { code: "KSFES" },
  KSRTC: { code: "KSRTC" },
  BDA: { code: "BDA" },
};

const AGENCY_ALIASES: Record<string, string> = Object.fromEntries(
  Object.values(AGENCIES).flatMap((a) => {
    const keys = [a.code.toLowerCase()];
    if (a.name) keys.push(a.name.toLowerCase());
    return keys.map((k) => [k, a.code]);
  }),
);

/**
 * Collapses a raw `civic_agency_title` onto its acronym. Returns null for the
 * dataset's own unassigned marker (the literal string "NULL", 655 rows) and for
 * anything blank — an unrouted grievance is reported as unrouted, not guessed.
 */
export function normalizeAgency(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v || v.toUpperCase() === "NULL") return null;
  return AGENCY_ALIASES[v.toLowerCase()] ?? v;
}

/** Display label for an agency code: "BBMP — Bruhat Bengaluru Mahanagara Palike". */
export function agencyLabel(code: string | null | undefined): string {
  if (!code) return "Unassigned";
  const meta = AGENCIES[code];
  return meta?.name ? `${meta.code} — ${meta.name}` : code;
}

// ------------------------------------------------------------------ statuses

export interface StatusMeta {
  id: IssueStatus;
  label: string;
  /** token suffix → bg-status-* */
  token: string;
  /** The dataset's `complaint_status_title` value this comes from, if any. */
  sourceValue?: string;
}

export const STATUSES: Record<IssueStatus, StatusMeta> = {
  reported: {
    id: "reported",
    label: "Reported",
    token: "status-reported",
    sourceValue: "Open",
  },
  verified: { id: "verified", label: "Verified", token: "status-verified" },
  in_progress: {
    id: "in_progress",
    label: "In Progress",
    token: "status-progress",
    sourceValue: "On-the-Job",
  },
  resolved: {
    id: "resolved",
    label: "Resolved",
    token: "status-resolved",
    sourceValue: "Resolved",
  },
  reopened: {
    id: "reopened",
    label: "Re-opened",
    token: "status-reopened",
    sourceValue: "Re-opened",
  },
  closed: {
    id: "closed",
    label: "Closed",
    token: "status-closed",
    sourceValue: "Closed",
  },
  rejected: {
    id: "rejected",
    label: "Rejected",
    token: "status-rejected",
    sourceValue: "Rejected",
  },
};

export const STATUS_ORDER: IssueStatus[] = [
  "reported",
  "verified",
  "in_progress",
  "resolved",
  "reopened",
  "closed",
  "rejected",
];

/** Reverse index: the dataset's `complaint_status_title` → our status. */
const SOURCE_STATUS_INDEX: Record<string, IssueStatus> = Object.fromEntries(
  STATUS_ORDER.flatMap((id) => {
    const sv = STATUSES[id].sourceValue;
    return sv ? [[sv.toLowerCase(), id] as const] : [];
  }),
);

/** Maps a source `complaint_status_title` onto our status, or null if unknown. */
export function statusFromSource(sourceStatus: string | null | undefined): IssueStatus | null {
  const v = (sourceStatus ?? "").trim().toLowerCase();
  if (!v) return null;
  return SOURCE_STATUS_INDEX[v] ?? null;
}

/**
 * Statuses that count as still outstanding. `rejected` and `closed` are neither
 * open nor resolved, so they are excluded from resolution rates rather than
 * being quietly counted as either.
 */
export const OPEN_STATUSES: IssueStatus[] = [
  "reported",
  "verified",
  "in_progress",
  "reopened",
];

/** Community confirmations needed to auto-advance Reported → Verified. */
export const CONFIRMATIONS_TO_VERIFY = 3;

/**
 * Severity 1-5 → label + color token (bg-sev-*). Severity comes from the AI
 * triage agent on citizen photo reports; ingested official records have none,
 * so `null` is reported as unrated rather than defaulted to a number.
 */
export function severityMeta(
  severity: number | null | undefined,
): { label: string; token: string } | null {
  if (severity == null || !Number.isFinite(severity)) return null;
  if (severity >= 5) return { label: "Critical", token: "sev-critical" };
  if (severity >= 4) return { label: "High", token: "sev-high" };
  if (severity >= 3) return { label: "Medium", token: "sev-med" };
  return { label: "Low", token: "sev-low" };
}

/**
 * The source dataset's own catch-all ward. Every row carrying this name has
 * `ward_id` 199 — one sentinel id beyond BBMP's 198 real wards — so it means
 * "not attributed to a ward", not a place. It is stored verbatim like any other
 * source value, but it is excluded from ward rankings, where it would otherwise
 * read as one of the busiest wards in the city.
 */
export const UNATTRIBUTED_WARD = "Other";

export function isRealWard(ward: string | null | undefined): boolean {
  return Boolean(ward) && ward !== UNATTRIBUTED_WARD;
}

// Demo scope: Bengaluru — where the real open grievance data is.
export const BENGALURU = {
  name: "Bengaluru",
  center: { lat: 12.9716, lng: 77.5946 } as const,
  defaultZoom: 12,
};
