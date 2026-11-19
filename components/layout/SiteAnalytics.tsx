"use client"

import { useEffect, useState, useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import type { BeforeSendEvent } from "@vercel/analytics/next"

// Loaded only after the page (hard rule #8: not in the first-load JS).
const Analytics = dynamic(() => import("@vercel/analytics/next").then((m) => m.Analytics), { ssr: false })

/** Internal pages are never counted; the public ones are counted without query strings (no ids or search terms). */
function clean(e: BeforeSendEvent): BeforeSendEvent | null {
  const url = new URL(e.url)
  if (/(^|\/)interno(\/|$)/i.test(url.pathname)) return null
  return { ...e, url: `${url.origin}${url.pathname}` }
}

const noop = () => () => {}
/** The real site (gigafazt.com), not a preview deployment or a local server: only it is counted. */
const onLiveSite = () => /(^|\.)gigafazt\.com$/i.test(window.location.hostname)

/** True once the page has loaded and the browser is idle (so analytics never competes with the page itself). */
function useAfterLoad() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const idle = (f: () => void) => (typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(f, { timeout: 3000 }) : setTimeout(f, 1500))
    const go = () => idle(() => setReady(true))
    if (document.readyState === "complete") go()
    else window.addEventListener("load", go, { once: true })
    return () => window.removeEventListener("load", go)
  }, [])
  return ready
}

/**
 * Vercel Web Analytics (owner, 2026-11-19): page views and the funnel events of lib/analytics.ts, no cookies. Named in
 * the privacy notice. Decided in the browser by the address (a build-time flag was empty on Vercel's builds and
 * removed the script), never on the internal pages, and loaded after the page.
 */
export function SiteAnalytics() {
  const live = useSyncExternalStore(noop, onLiveSite, () => false)
  const path = usePathname() ?? ""
  const ready = useAfterLoad()
  if (!live || !ready || /(^|\/)interno(\/|$)/i.test(path)) return null
  return <Analytics beforeSend={clean} />
}
