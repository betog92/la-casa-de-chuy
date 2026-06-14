import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/account",
        "/auth/",
        "/reservaciones/",
        "/reservas/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
