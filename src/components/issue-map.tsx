"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, LayersControl, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { DELHI, severityMeta, CATEGORIES } from "@/lib/domain";
import { SEVERITY_HEX, CATEGORY_HEX } from "@/lib/colors";
import type { Issue } from "@/lib/types";

export type ColorBy = "severity" | "category";

function colorFor(issue: Issue, mode: ColorBy): string {
  if (mode === "category") return CATEGORY_HEX[issue.category];
  const token = severityMeta(issue.severity).token.replace("sev-", "") as
    | "low"
    | "med"
    | "high"
    | "critical";
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
          <p style="font-size:12px;color:#737373;margin:2px 0">${CATEGORIES[i.category].label} · ${severityMeta(i.severity).label} severity</p>
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

export default function IssueMap({
  issues,
  colorBy = "severity",
}: {
  issues: Issue[];
  colorBy?: ColorBy;
}) {
  return (
    <MapContainer
      center={[DELHI.center.lat, DELHI.center.lng]}
      zoom={DELHI.defaultZoom}
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

      <ClusteredMarkers issues={issues} colorBy={colorBy} />
    </MapContainer>
  );
}
