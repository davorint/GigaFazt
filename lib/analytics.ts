/**
 * Funnel events (names fixed by SPEC.md) sent to Vercel Web Analytics (owner, 2026-11-19; no cookies, named in the
 * privacy notice). Custom events are recorded on Vercel's Pro plan; on Hobby only page views are, and this is a no-op
 * there. Properties are reduced to strings, numbers and booleans (what Vercel accepts); nothing a visitor typed is sent.
 *
 * No import of @vercel/analytics here (this file is in every page's first load, hard rule #8): events go into the same
 * queue the library uses (window.va / window.vaq), which its script reads when it loads after the page
 * (components/layout/SiteAnalytics.tsx).
 */

export type AnalyticsEvent =
  | "coverage_check_started"
  | "coverage_check_completed"
  | "recommender_completed"
  | "plan_selected"
  | "addon_toggled"
  | "lead_submitted"
  | "whatsapp_clicked"
  | "map_region_opened"
  | "brief_opened"

type Prop = string | number | boolean | null
type VaWindow = Window & { va?: (...params: unknown[]) => void; vaq?: unknown[][] }

/** The library's queue (its initQueue): calls wait in window.vaq until the analytics script reads them. */
function va(...params: unknown[]) {
  const w = window as VaWindow
  if (!w.va)
    w.va = (...p: unknown[]) => {
      ;(w.vaq ??= []).push(p)
    }
  w.va(...params)
}

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  const clean: Record<string, Prop> = {}
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string") clean[k] = v.slice(0, 100)
    else if (typeof v === "number" || typeof v === "boolean" || v === null) clean[k] = v
    else if (Array.isArray(v)) clean[k] = v.filter((x) => typeof x === "string" || typeof x === "number").join(",").slice(0, 100)
  }
  if (process.env.NODE_ENV !== "production") console.log(`[analytics] ${event}`, clean)
  if (typeof window === "undefined") return
  try {
    va("event", { name: event, data: clean })
  } catch {
    // Analytics must never break a page.
  }
}
