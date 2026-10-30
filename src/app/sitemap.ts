import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";


export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ["", "/report", "/map", "/dashboard", "/leaderboard"];
  return routes.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "daily" : "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
