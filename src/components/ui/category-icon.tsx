import { TriangleAlert, Droplets, Lightbulb, Trash2, CircleHelp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IssueCategory } from "@/lib/domain";

const MAP: Record<IssueCategory, LucideIcon> = {
  pothole: TriangleAlert,
  water_leak: Droplets,
  streetlight: Lightbulb,
  waste: Trash2,
  other: CircleHelp,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: IssueCategory;
  className?: string;
}) {
  const Icon = MAP[category] ?? CircleHelp;
  return <Icon className={className} />;
}
