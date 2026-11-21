import type { MetadataRoute } from "next"
import { SITE_URL, SITE_URL_CONFIGURED } from "@/lib/site"

export default function robots(): MetadataRoute.Robots {
  // No real origin yet (DOMAIN placeholder): keep crawlers out rather than
  // publishing localhost canonicals.
  if (!SITE_URL_CONFIGURED) return { rules: { userAgent: "*", disallow: "/" } }
  return {
    // The client portal (/mi-cuenta, WispDavor) is personal: never crawled.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/mi-cuenta", "/es/mi-cuenta", "/en/mi-cuenta"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
