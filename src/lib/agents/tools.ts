import "server-only";
import { Type, type FunctionDeclaration } from "@google/genai";
import { distanceBetween } from "geofire-common";
import { supabaseAdmin } from "@/lib/server/supabase";
import { agencyStats, wardStats } from "@/lib/server/stats";
import { agencyMap } from "@/lib/server/agencies";
import {
  AGENCIES,
  CATEGORIES,
  CATEGORY_LIST,
  OPEN_STATUSES,
  UNATTRIBUTED_WARD,
  isRealWard,
  normalizeAgency,
  type IssueCategory,
} from "@/lib/domain";

/**
 * Tools the investigation agent can call. Every one reads the real grievance
 * table — none of them can make a number up, and each returns the record ids
 * or counts behind its answer so the agent's claims stay checkable.
 *
 * Tools never throw. A bad argument comes back as `{ error, hint, ... }` so the
 * model can read the problem and correct itself on the next turn, which is the
 * behaviour the tool-call trace is meant to show.
 */

export type ToolResult = Record<string, unknown>;

const CATEGORY_IDS = CATEGORY_LIST.map((c) => c.id);

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "search_similar_grievances",
    description:
      "Find real grievance records near a point, optionally of one category. Returns how many exist, how many were resolved, and the closest examples with their source record ids. Use this to judge whether an issue is recurring or isolated.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lat: { type: Type.NUMBER, description: "Latitude in decimal degrees." },
        lng: { type: Type.NUMBER, description: "Longitude in decimal degrees." },
        radius_km: {
          type: Type.NUMBER,
          description: "Search radius in kilometres, 0.05 to 5. Defaults to 1.",
        },
        category: {
          type: Type.STRING,
          description: `Optional category filter. One of: ${CATEGORY_IDS.join(", ")}.`,
        },
      },
      required: ["lat", "lng"],
    },
  },
  {
    name: "get_ward_stats",
    description:
      "Grievance volume and resolution rate for one Bengaluru ward, from the real records. Use it to show how a ward is performing.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        ward: { type: Type.STRING, description: "Ward name, e.g. 'Bellanduru'." },
      },
      required: ["ward"],
    },
  },
  {
    name: "get_agency_performance",
    description:
      "Resolved/open split and resolution rate for one agency (BBMP, BWSSB, BTP, KSPCB, BESCOM, BCP, BMTC, KSFES, KSRTC, BDA), from the real records.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        agency: { type: Type.STRING, description: "Agency acronym, e.g. 'BBMP'." },
      },
      required: ["agency"],
    },
  },
  {
    name: "get_category_routing",
    description:
      "Which agency actually handles a category, derived by counting the real records rather than from a fixed list. Use this before naming the responsible authority.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        category: {
          type: Type.STRING,
          description: `One of: ${CATEGORY_IDS.join(", ")}.`,
        },
      },
      required: ["category"],
    },
  },
];

// ------------------------------------------------------------------ helpers

const rate = (resolved: number, open: number) =>
  resolved + open > 0 ? Math.round((resolved / (resolved + open)) * 100) : null;

/** Cheap edit-distance-free fuzzy match: exact, then case-insensitive contains. */
function closestNames(needle: string, haystack: string[], limit = 5): string[] {
  const n = needle.trim().toLowerCase();
  const starts = haystack.filter((h) => h.toLowerCase().startsWith(n));
  const contains = haystack.filter(
    (h) => !starts.includes(h) && h.toLowerCase().includes(n),
  );
  const shared = haystack.filter(
    (h) =>
      !starts.includes(h) &&
      !contains.includes(h) &&
      n.length >= 4 &&
      h.toLowerCase().includes(n.slice(0, 4)),
  );
  return [...starts, ...contains, ...shared].slice(0, limit);
}

// -------------------------------------------------------------------- tools

async function searchSimilarGrievances(args: ToolResult): Promise<ToolResult> {
  const lat = Number(args.lat);
  const lng = Number(args.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "lat and lng must be numbers.", hint: "Pass decimal degrees." };
  }
  const radiusKm = Math.min(Math.max(Number(args.radius_km) || 1, 0.05), 5);

  let category: IssueCategory | null = null;
  if (args.category != null && String(args.category).trim() !== "") {
    const c = String(args.category).trim().toLowerCase();
    if (!CATEGORY_IDS.includes(c as IssueCategory)) {
      return {
        error: `Unknown category "${args.category}".`,
        valid_categories: CATEGORY_IDS,
        hint: "Retry with one of valid_categories, or omit category to search all.",
      };
    }
    category = c as IssueCategory;
  }

  // Bounding box first so the database does the filtering, then exact distance.
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180) || 1);
  let q = supabaseAdmin
    .from("issues")
    .select("id, title, status, category, ward, agency, lat, lng, created_at, source_record_id, source_url")
    .gte("lat", lat - dLat)
    .lte("lat", lat + dLat)
    .gte("lng", lng - dLng)
    .lte("lng", lng + dLng)
    .limit(1000);
  if (category) q = q.eq("category", category);

  const { data, error } = await q;
  if (error) {
    return { error: `Database query failed: ${error.message}`, hint: "Try a smaller radius." };
  }

  type Row = {
    id: string;
    title: string;
    status: string;
    category: string;
    ward: string | null;
    lat: number;
    lng: number;
    created_at: number;
    source_record_id: string | null;
    source_url: string | null;
  };
  const near = (data as Row[])
    .map((r) => ({ ...r, km: distanceBetween([lat, lng], [r.lat, r.lng]) }))
    .filter((r) => r.km <= radiusKm)
    .sort((a, b) => a.km - b.km);

  if (near.length === 0) {
    return {
      matches: 0,
      radius_km: radiusKm,
      category: category ?? "any",
      note: "No recorded grievances within this radius. This location has no history in the dataset.",
    };
  }

  const resolved = near.filter((r) => r.status === "resolved").length;
  const open = near.filter((r) => OPEN_STATUSES.includes(r.status as never)).length;
  const wards = new Map<string, number>();
  for (const r of near) if (r.ward) wards.set(r.ward, (wards.get(r.ward) ?? 0) + 1);
  const times = near.map((r) => Number(r.created_at)).filter(Number.isFinite);

  return {
    matches: near.length,
    radius_km: radiusKm,
    category: category ?? "any",
    resolved,
    open,
    resolution_rate_pct: rate(resolved, open),
    dominant_ward: [...wards].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    earliest: times.length ? new Date(Math.min(...times)).toISOString().slice(0, 10) : null,
    latest: times.length ? new Date(Math.max(...times)).toISOString().slice(0, 10) : null,
    closest: near.slice(0, 5).map((r) => ({
      title: r.title.slice(0, 120),
      status: r.status,
      category: r.category,
      metres_away: Math.round(r.km * 1000),
      source_record_id: r.source_record_id,
      source_url: r.source_url,
    })),
  };
}

async function getWardStats(args: ToolResult): Promise<ToolResult> {
  const asked = String(args.ward ?? "").trim();
  if (!asked) return { error: "ward is required.", hint: "Pass a ward name." };

  const all = await wardStats();
  if (all.length === 0) {
    return { error: "No ward data available.", hint: "The dataset may not be ingested yet." };
  }

  const names = all.map((w) => w.ward);
  const exact = all.find((w) => w.ward.toLowerCase() === asked.toLowerCase());
  if (!exact) {
    const suggestions = closestNames(asked, names);
    return {
      error: `No ward named "${asked}".`,
      did_you_mean: suggestions,
      total_wards: names.length,
      hint: suggestions.length
        ? "Retry get_ward_stats with one of did_you_mean."
        : "Ward names come from the source dataset; try a different spelling.",
    };
  }

  if (exact.ward === UNATTRIBUTED_WARD) {
    return {
      ward: exact.ward,
      total: exact.total,
      note: `"${UNATTRIBUTED_WARD}" is the dataset's catch-all for records with no ward attributed, not a real place. Do not describe it as a locality.`,
    };
  }

  const ranked = all.filter((w) => isRealWard(w.ward));
  const rank = ranked.findIndex((w) => w.ward === exact.ward) + 1;
  return {
    ward: exact.ward,
    total: exact.total,
    resolved: exact.resolved,
    open: exact.open,
    resolution_rate_pct: Math.round(exact.resolutionRate * 100),
    volume_rank: rank,
    of_wards: ranked.length,
  };
}

async function getAgencyPerformance(args: ToolResult): Promise<ToolResult> {
  const asked = String(args.agency ?? "").trim();
  if (!asked) return { error: "agency is required.", hint: "Pass an agency acronym." };

  const code = normalizeAgency(asked);
  const all = await agencyStats();
  const match = all.find((a) => a.agency && code && a.agency.toLowerCase() === code.toLowerCase());
  if (!match || !match.agency) {
    return {
      error: `No records for agency "${asked}".`,
      known_agencies: all.filter((a) => a.agency).map((a) => a.agency),
      hint: "Retry with one of known_agencies.",
    };
  }

  return {
    agency: match.agency,
    full_name: AGENCIES[match.agency]?.name ?? null,
    total: match.total,
    resolved: match.resolved,
    open: match.open,
    rejected_or_closed: match.undecided,
    resolution_rate_pct: Math.round(match.resolutionRate * 100),
    note: "resolution_rate_pct excludes rejected and closed records from the denominator.",
  };
}

async function getCategoryRouting(args: ToolResult): Promise<ToolResult> {
  const asked = String(args.category ?? "").trim().toLowerCase();
  if (!CATEGORY_IDS.includes(asked as IssueCategory)) {
    return {
      error: `Unknown category "${args.category}".`,
      valid_categories: CATEGORY_IDS,
      hint: "Retry with one of valid_categories.",
    };
  }
  const map = await agencyMap();
  const hit = map.get(asked as IssueCategory);
  if (!hit) {
    return {
      category: asked,
      agency: null,
      note: "No record in this category carries an agency, so no routing target can be derived from the data.",
    };
  }
  return {
    category: asked,
    category_label: CATEGORIES[asked as IssueCategory].label,
    agency: hit.agency,
    full_name: AGENCIES[hit.agency]?.name ?? null,
    backed_by_records: hit.count,
    of_category_records_with_an_agency: hit.categoryTotal,
    note: "Derived by counting real grievances, not from a fixed department list.",
  };
}

const HANDLERS: Record<string, (a: ToolResult) => Promise<ToolResult>> = {
  search_similar_grievances: searchSimilarGrievances,
  get_ward_stats: getWardStats,
  get_agency_performance: getAgencyPerformance,
  get_category_routing: getCategoryRouting,
};

/**
 * Runs one tool. Never throws: an unknown name, a bad argument or a database
 * failure all come back as a result the model can read and recover from.
 */
export async function runTool(name: string, args: ToolResult): Promise<ToolResult> {
  const handler = HANDLERS[name];
  if (!handler) {
    return {
      error: `No tool named "${name}".`,
      available_tools: Object.keys(HANDLERS),
      hint: "Call one of available_tools.",
    };
  }
  try {
    return await handler(args ?? {});
  } catch (err) {
    return {
      error: `Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Try different arguments, or continue without this tool.",
    };
  }
}
