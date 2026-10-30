"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { BENGALURU, severityMeta, CATEGORIES } from "@/lib/domain";
import { SEVERITY_HEX, CATEGORY_HEX, UNRATED_HEX } from "@/lib/colors";
import type { Issue, WardChoropleth } from "@/lib/types";

export type ColorBy = "severity" | "category";

function colorFor(issue: Issue, mode: ColorBy): string {
  if (mode === "category") return CATEGORY_HEX[issue.category];
  const meta = severityMeta(issue.severity);
  // Records with no AI severity rating get a neutral marker, not a fake "low".
  if (!meta) return UNRATED_HEX;
  const token = meta.token.replace("sev-", "") as "low" | "med" | "high" | "critical";
  return SEVERITY_HEX[token];
}

function markerIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.15)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

function ClusteredMarkers({ issues, colorBy }: { issues: Issue[]; colorBy: ColorBy }) {
  const map = useMap();
  useEffect(() => {
    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
    });
    for (const i of issues) {
      const m = L.marker([i.lat, i.lng], { icon: markerIcon(colorFor(i, colorBy)) });
      m.bindPopup(
        `<div style="min-width:160px">
          <p style="font-weight:600;margin:0">${esc(i.title)}</p>
          <p style="font-size:12px;color:#737373;margin:2px 0">${CATEGORIES[i.category].label}${
            severityMeta(i.severity) ? ` · ${severityMeta(i.severity)!.label} severity` : ""
          }${i.agency ? ` · ${esc(i.agency)}` : ""}</p>
          ${
            i.locationSource === "approximate"
              ? '<p style="font-size:11px;color:#a16207;margin:2px 0">Approximate location — not a device fix</p>'
              : ""
          }
          <a href="/issue/${i.id}" style="font-size:13px;color:#2563eb;text-decoration:underline">View issue</a>
        </div>`,
      );
      group.addLayer(m);
    }
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map, issues, colorBy]);
  return null;
}

/**
 * Shades BBMP ward boundaries by each ward's real resolution rate.
 *
 * The boundary file and the grievance records spell wards differently, so the
 * join is on the source's numeric ward_id, never the name. A ward with no
 * records, or none yet decided either way, is drawn as an outline with no fill
 * rather than being coloured as if it scored zero.
 */
function WardChoroplethLayer({ stats }: { stats: Map<number, WardChoropleth> }) {
  const map = useMap();

  useEffect(() => {
    let cancelled = false;
    let layer: L.GeoJSON | null = null;

    (async () => {
      try {
        const res = await fetch("/bengaluru-wards.geojson");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const gj = await res.json();
        if (cancelled) return;

        layer = L.geoJSON(gj, {
          style: (f) => {
            const s = stats.get(f?.properties?.wardId);
            const rate = s?.resolutionRate ?? null;
            return {
              color: "#64748b",
              weight: 1,
              fillColor: rate == null ? "transparent" : rateColor(rate),
              // Light enough to read streets and markers through.
              fillOpacity: rate == null ? 0 : 0.42,
            };
          },
          onEachFeature: (f, lyr) => {
            const p = f.properties ?? {};
            const s = stats.get(p.wardId);
            const name = esc(String(p.name ?? `Ward ${p.wardId}`));
            const zone = p.zone ? `<p style="font-size:12px;color:#737373;margin:2px 0">${esc(String(p.zone))} zone</p>` : "";
            lyr.bindPopup(
              s
                ? `<div style="min-width:170px">
                     <p style="font-weight:600;margin:0">${name}</p>${zone}
                     <p style="font-size:13px;margin:4px 0 0">
                       <strong>${Math.round((s.resolutionRate ?? 0) * 100)}%</strong> resolved
                     </p>
                     <p style="font-size:12px;color:#737373;margin:2px 0">
                       ${s.total} records · ${s.resolved} resolved · ${s.open} open
                     </p>
                   </div>`
                : `<div style="min-width:150px">
                     <p style="font-weight:600;margin:0">${name}</p>${zone}
                     <p style="font-size:12px;color:#737373;margin:2px 0">No records in this ward.</p>
                   </div>`,
            );
          },
        });
        layer.addTo(map);
        // Keep the shading under the markers.
        layer.bringToBack();
      } catch (err) {
        // A missing boundary file must not take the map down.
        console.error("ward boundaries unavailable:", err);
      }
    })();

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [map, stats]);

  return null;
}

/** Red (nothing fixed) → green (everything fixed). */
function rateColor(rate: number): string {
  const stops: [number, string][] = [
    [0.1, "#b91c1c"],
    [0.2, "#ef4444"],
    [0.3, "#f59e0b"],
    [0.45, "#eab308"],
    [0.6, "#84cc16"],
    [1.01, "#16a34a"],
  ];
  return stops.find(([t]) => rate < t)?.[1] ?? "#16a34a";
}

export default function IssueMap({
  issues,
  colorBy = "severity",
  wardStats,
  showWards = false,
}: {
  issues: Issue[];
  colorBy?: ColorBy;
  wardStats?: Map<number, WardChoropleth>;
  showWards?: boolean;
}) {
  return (
    <MapContainer
      center={[BENGALURU.center.lat, BENGALURU.center.lng]}
      zoom={BENGALURU.defaultZoom}
      scrollWheelZoom
      className="h-full w-full"
    >
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Light">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Streets">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Dark">
          <TileLayer
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a> &copy; OpenStreetMap'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Satellite">
          <TileLayer
            attribution="Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          />
        </LayersControl.BaseLayer>
      </LayersControl>

      {showWards && wardStats && wardStats.size > 0 && (
        <WardChoroplethLayer stats={wardStats} />
      )}
      <ClusteredMarkers issues={issues} colorBy={colorBy} />
    </MapContainer>
  );
}
