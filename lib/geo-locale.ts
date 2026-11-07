/**
 * Country-based default locale. Visitors from Spanish-speaking countries land
 * on Spanish even when their browser asks for English; everyone else keeps
 * next-intl's normal negotiation (NEXT_LOCALE cookie → Accept-Language → es).
 * An explicit choice (the language switcher's cookie or an /en URL) always wins.
 */

/** ISO 3166-1 alpha-2 codes of countries where Spanish is an official or majority language. */
export const SPANISH_SPEAKING = new Set([
  "MX", "ES", "AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "SV",
  "GQ", "GT", "HN", "NI", "PA", "PY", "PE", "PR", "UY", "VE",
])

/** Visitor-country headers set by common hosts/CDNs (Vercel, Cloudflare, CloudFront, Netlify-style). */
const COUNTRY_HEADERS = ["x-vercel-ip-country", "cf-ipcountry", "cloudfront-viewer-country", "x-country-code"]

export function visitorCountry(headers: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headers.get(name)?.trim().toUpperCase()
    if (value && /^[A-Z]{2}$/.test(value)) return value
  }
  return null
}

export function prefersSpanishByCountry(headers: Headers): boolean {
  const country = visitorCountry(headers)
  return country !== null && SPANISH_SPEAKING.has(country)
}
