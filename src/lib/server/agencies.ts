import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase";
import type { IssueCategory } from "@/lib/domain";

/**
 * Category → responsible agency, derived from the real grievance records rather
 * than a hardcoded department list.
 *
 * `category_agency_counts()` (see supabase/schema.sql) groups the ingested rows
 * by category and agency; the dominant agency per category is the one that
 * actually handles that category in Bengaluru. Every routing target therefore
 * traces back to a count of real grievances, and a category with no rows gets
 * no agency instead of a guess.
 */
export interface AgencyForCategory {
  agency: string;
  /** How many real records back this routing decision. */
  count: number;
  /** Total records in this category that carry an agency. */
  categoryTotal: number;
}

type Row = { category: string; agency: string; n: number };

let cache: { map: Map<IssueCategory, AgencyForCategory>; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

async function load(): Promise<Map<IssueCategory, AgencyForCategory>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.map;

  const { data, error } = await supabaseAdmin.rpc("category_agency_counts");
  if (error) throw new Error(`category_agency_counts: ${error.message}`);

  const totals = new Map<string, number>();
  for (const r of (data ?? []) as Row[]) {
    totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.n));
  }

  // The RPC already orders by count desc within each category.
  const map = new Map<IssueCategory, AgencyForCategory>();
  for (const r of (data ?? []) as Row[]) {
    const cat = r.category as IssueCategory;
    if (map.has(cat)) continue;
    map.set(cat, {
      agency: r.agency,
      count: Number(r.n),
      categoryTotal: totals.get(r.category) ?? Number(r.n),
    });
  }

  cache = { map, at: Date.now() };
  return map;
}

/**
 * The agency that handles this category, or null if no real record supports a
 * routing decision yet. Never throws on a database hiccup — routing degrades to
 * "unassigned" rather than taking the page down.
 */
export async function agencyForCategory(
  category: IssueCategory,
): Promise<AgencyForCategory | null> {
  try {
    return (await load()).get(category) ?? null;
  } catch (err) {
    console.error("agencyForCategory failed:", err);
    return null;
  }
}

/** The whole derived map — for the dashboard's routing-transparency panel. */
export async function agencyMap(): Promise<Map<IssueCategory, AgencyForCategory>> {
  try {
    return await load();
  } catch {
    return new Map();
  }
}

/**
 * Agency for a specific issue: its own recorded agency when the source gave one
 * (the strongest evidence), otherwise the category-derived agency.
 */
export async function resolveAgency(issue: {
  agency?: string | null;
  category: IssueCategory;
}): Promise<{ agency: string | null; basis: "record" | "derived" | "none"; count?: number }> {
  if (issue.agency) return { agency: issue.agency, basis: "record" };
  const derived = await agencyForCategory(issue.category);
  if (derived) return { agency: derived.agency, basis: "derived", count: derived.count };
  return { agency: null, basis: "none" };
}
