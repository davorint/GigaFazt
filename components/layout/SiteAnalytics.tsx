"use client"

import { usePathname } from "next/navigation"
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"

/** Internal pages are never counted; the public ones are counted without query strings (no ids or search terms). */
function clean(e: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(e.url)
  if (/(^|\/)interno(\/|$)/i.test(url.pathname)) return null
  return { ...e, url: `${url.origin}${url.pathname}` }
}

/**
 * Vercel Web Analytics (owner, 2026-11-19): page views and the funnel events of lib/analytics.ts, no cookies. Named in
 * the privacy notice. Only on the production deployment (previews and local runs aren't counted; the script only exists
 * on Vercel) and never on the internal pages.
 */
export function SiteAnalytics() {
  const path = usePathname() ?? ""
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production" || /(^|\/)interno(\/|$)/i.test(path)) return null
  return <Analytics beforeSend={clean} />
}
