// Centralized CSS-variable color maps for charts, markers, legends, and accents.
import type { IssueCategory, IssueStatus } from "@/lib/domain";

export const CATEGORY_COLOR: Record<IssueCategory, string> = {
  pothole: "var(--color-cat-pothole)",
  waste: "var(--color-cat-waste)",
  streetlight: "var(--color-cat-light)",
  water_leak: "var(--color-cat-water)",
  sewerage: "var(--color-cat-sewerage)",
  stormwater: "var(--color-cat-stormwater)",
  traffic: "var(--color-cat-traffic)",
  animals: "var(--color-cat-animals)",
  pollution: "var(--color-cat-pollution)",
  electricity: "var(--color-cat-electricity)",
  safety: "var(--color-cat-safety)",
  parks: "var(--color-cat-parks)",
  transport: "var(--color-cat-transport)",
  civic_services: "var(--color-cat-services)",
  other: "var(--color-cat-other)",
};

export const STATUS_COLOR: Record<IssueStatus, string> = {
  reported: "var(--color-status-reported)",
  verified: "var(--color-status-verified)",
  in_progress: "var(--color-status-progress)",
  resolved: "var(--color-status-resolved)",
  reopened: "var(--color-status-reopened)",
  closed: "var(--color-status-closed)",
  rejected: "var(--color-status-rejected)",
};

export const SEVERITY_COLOR: Record<"low" | "med" | "high" | "critical", string> = {
  low: "var(--color-sev-low)",
  med: "var(--color-sev-med)",
  high: "var(--color-sev-high)",
  critical: "var(--color-sev-critical)",
};

// Raw hex (for Leaflet divIcons / canvas where CSS vars don't resolve).
export const SEVERITY_HEX: Record<"low" | "med" | "high" | "critical", string> = {
  low: "#16a34a",
  med: "#f59e0b",
  high: "#ef4444",
  critical: "#b91c1c",
};

export const CATEGORY_HEX: Record<IssueCategory, string> = {
  pothole: "#e11d48",
  waste: "#16a34a",
  streetlight: "#f59e0b",
  water_leak: "#0ea5e9",
  sewerage: "#0f766e",
  stormwater: "#0284c7",
  traffic: "#ea580c",
  animals: "#a16207",
  pollution: "#78716c",
  electricity: "#ca8a04",
  safety: "#b91c1c",
  parks: "#4d7c0f",
  transport: "#4338ca",
  civic_services: "#9333ea",
  other: "#7c3aed",
};

/** Marker/chip color for an issue with no AI severity rating (official records). */
export const UNRATED_HEX = "#6b7280";
