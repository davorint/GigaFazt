import type { MetadataRoute } from "next"
import { routing } from "@/i18n/routing"
import { coverageAreas } from "@/lib/coverage"
import { SITE_URL, alternatesFor } from "@/lib/site"

/** Every locale × page, each with its hreflang alternates (SPEC SEO). */
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/planes", "/empresas", "/aviso-de-privacidad", ...coverageAreas.map((a) => `/cobertura/${a.slug}`)]
  return paths.flatMap((path) =>
    routing.locales.map((locale) => {
      const { canonical, languages } = alternatesFor(locale, path)
      return {
        url: `${SITE_URL}${canonical}`,
        alternates: {
          languages: Object.fromEntries(
            Object.entries(languages).map(([k, v]) => [k, `${SITE_URL}${v}`])
          ),
        },
        changeFrequency: path === "/" ? "weekly" : "monthly",
        priority: path === "/" ? 1 : path === "/planes" ? 0.9 : path === "/empresas" ? 0.8 : path === "/aviso-de-privacidad" ? 0.3 : 0.7,
      } satisfies MetadataRoute.Sitemap[number]
    })
  )
}
