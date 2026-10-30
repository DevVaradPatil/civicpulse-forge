import {
  TriangleAlert,
  Droplets,
  Lightbulb,
  Trash2,
  CircleHelp,
  Waves,
  CloudRain,
  TrafficCone,
  Dog,
  Factory,
  Zap,
  ShieldAlert,
  Trees,
  Bus,
  Building2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { IssueCategory } from "@/lib/domain";

const MAP: Record<IssueCategory, LucideIcon> = {
  pothole: TriangleAlert,
  waste: Trash2,
  streetlight: Lightbulb,
  water_leak: Droplets,
  sewerage: Waves,
  stormwater: CloudRain,
  traffic: TrafficCone,
  animals: Dog,
  pollution: Factory,
  electricity: Zap,
  safety: ShieldAlert,
  parks: Trees,
  transport: Bus,
  civic_services: Building2,
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
