// Centralized CSS-variable color maps for charts, markers, legends, and accents.
import type { IssueCategory, IssueStatus } from "@/lib/domain";

export const CATEGORY_COLOR: Record<IssueCategory, string> = {
  pothole: "var(--color-cat-pothole)",
  water_leak: "var(--color-cat-water)",
  streetlight: "var(--color-cat-light)",
  waste: "var(--color-cat-waste)",
  other: "var(--color-cat-other)",
};

export const STATUS_COLOR: Record<IssueStatus, string> = {
  reported: "var(--color-status-reported)",
  verified: "var(--color-status-verified)",
  in_progress: "var(--color-status-progress)",
  resolved: "var(--color-status-resolved)",
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
  water_leak: "#0ea5e9",
  streetlight: "#f59e0b",
  waste: "#16a34a",
  other: "#7c3aed",
};
