import { company } from "./company"
import { isPlaceholder } from "./placeholder"
import { routing } from "../i18n/routing"

/**
 * Absolute site origin for canonical URLs, hreflang, sitemap and OG.
 * Priority: NEXT_PUBLIC_SITE_URL → BUSINESS.md DOMAIN → localhost. While it
 * falls back to localhost, robots/metadata say noindex (no wrong canonicals in
 * search). DOMAIN is an open question in PROGRESS.md.
 */
/** True once a real origin is known; until then the site asks not to be indexed. */
export const SITE_URL_CONFIGURED: boolean =
  !!process.env.NEXT_PUBLIC_SITE_URL || !isPlaceholder(company.domain)

export const SITE_URL: string = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (isPlaceholder(company.domain) ? "http://localhost:3000" : `https://${company.domain}`)
).replace(/\/$/, "")

/** hreflang codes per locale (es is Mexican Spanish, the primary market). */
export const HREFLANG: Record<string, string> = { es: "es-MX", en: "en" }

/** `path` is locale-less and starts with "/" ("/" for home, "/planes", …). */
export function localizedPath(locale: string, path: string): string {
  return `/${locale}${path === "/" ? "" : path}`
}

/** Next metadata `alternates` for a locale-less path: canonical + hreflang + x-default. */
export function alternatesFor(locale: string, path: string) {
  const languages: Record<string, string> = {}
  for (const l of routing.locales) languages[HREFLANG[l] ?? l] = localizedPath(l, path)
  languages["x-default"] = localizedPath(routing.defaultLocale, path)
  return { canonical: localizedPath(locale, path), languages }
}

/** Stable @id of the Organization node (only emitted once COMPANY_NAME is set). */
export const ORG_ID = `${SITE_URL}/#organization`

/** Absolute URL of a locale-less path. */
export function absoluteUrl(locale: string, path: string): string {
  return `${SITE_URL}${localizedPath(locale, path)}`
}

/**
 * Per-page metadata: title/description plus canonical + hreflang, and the
 * matching Open Graph / Twitter fields (page-level openGraph replaces the
 * layout's, so every page sets its own). The locale OG image is referenced
 * explicitly: a nested page's openGraph drops the inherited image file.
 */
export function pageMeta(
  locale: string,
  path: string,
  title: string,
  description: string,
  ogAlt: string
) {
  const alternates = alternatesFor(locale, path)
  const ogLocale = (l: string) => (HREFLANG[l] ?? l).replace("-", "_")
  return {
    title,
    description,
    alternates,
    openGraph: {
      type: "website" as const,
      title,
      description,
      url: alternates.canonical,
      locale: ogLocale(locale),
      alternateLocale: routing.locales.filter((l) => l !== locale).map(ogLocale),
      images: [{ url: `/${locale}/opengraph-image/default`, width: 1200, height: 630, alt: ogAlt }],
    },
    twitter: { card: "summary_large_image" as const, title, description },
  }
}
