import type { MetadataRoute } from "next";
import { PUBLIC_SITEMAP_PATHS, SITE_URL } from "@/lib/site-seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return PUBLIC_SITEMAP_PATHS.map((path) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    lastModified,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/reservar" ? 0.9 : 0.7,
  }));
}
