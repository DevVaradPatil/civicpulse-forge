import { CATEGORY_COLOR } from "@/lib/colors";
import type { Hotspot } from "@/lib/types";

/**
 * The city drawn from its own grievance record coordinates — one dot per ~1.2km
 * cell, sized by how many records fall in it and coloured by the category that
 * dominates there. Server-rendered SVG: no map tiles, no network call at view
 * time, and nothing on screen that is not a real aggregate.
 */
export function CityScatter({
  cells,
  total,
}: {
  cells: Hotspot[];
  total: number;
}) {
  if (cells.length === 0) {
    return (
      <div className="flex aspect-[3/2] w-full items-center justify-center rounded-xl border border-border bg-surface">
        <p className="px-6 text-center text-sm text-muted">
          No geocoded records yet — the map fills in as reports arrive.
        </p>
      </div>
    );
  }

  const W = 600;
  const H = 400;
  const pad = 24;

  const lats = cells.map((c) => c.lat);
  const lngs = cells.map((c) => c.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;

  // Equal-aspect fit so the city is not stretched: one scale for both axes.
  const scale = Math.min((W - pad * 2) / spanLng, (H - pad * 2) / spanLat);
  const offsetX = (W - spanLng * scale) / 2;
  const offsetY = (H - spanLat * scale) / 2;
  const x = (lng: number) => offsetX + (lng - minLng) * scale;
  // Latitude grows northward, SVG y grows downward.
  const y = (lat: number) => offsetY + (maxLat - lat) * scale;

  const maxCount = Math.max(...cells.map((c) => c.count));
  const r = (count: number) => 2 + Math.sqrt(count / maxCount) * 9;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        className="h-auto rounded-xl border border-border bg-surface"
        role="img"
        aria-label={`Geographic spread of ${total.toLocaleString("en-IN")} civic grievance records across Bengaluru`}
      >
        {cells.map((c) => (
          <circle
            key={c.cell}
            cx={x(c.lng)}
            cy={y(c.lat)}
            r={r(c.count)}
            fill={CATEGORY_COLOR[c.topCategory]}
            fillOpacity={0.55}
          />
        ))}
      </svg>
      <figcaption className="mt-2 text-center text-xs text-muted">
        {total.toLocaleString("en-IN")} real grievance records across{" "}
        {cells.length.toLocaleString("en-IN")} neighbourhood cells. Dot size is record
        volume; colour is the dominant category.
      </figcaption>
    </figure>
  );
}
