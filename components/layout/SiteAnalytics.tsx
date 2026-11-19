"use client"

import { useSyncExternalStore } from "react"
import { usePathname } from "next/navigation"
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next"

/** Internal pages are never counted; the public ones are counted without query strings (no ids or search terms). */
function clean(e: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(e.url)
  if (/(^|\/)interno(\/|$)/i.test(url.pathname)) return null
  return { ...e, url: `${url.origin}${url.pathname}` }
}

const noop = () => () => {}
/** The real site (gigafazt.com), not a preview deployment or a local server: only it is counted. */
const onLiveSite = () => /(^|\.)gigafazt\.com$/i.test(window.location.hostname)

/**
 * Vercel Web Analytics (owner, 2026-11-19): page views and the funnel events of lib/analytics.ts, no cookies. Named in
 * the privacy notice. Decided in the browser by the address (a build-time flag was empty on Vercel's builds and
 * removed the script), and never on the internal pages.
 */
export function SiteAnalytics() {
  const live = useSyncExternalStore(noop, onLiveSite, () => false)
  const path = usePathname() ?? ""
  if (!live || /(^|\/)interno(\/|$)/i.test(path)) return null
  return <Analytics beforeSend={clean} />
}
