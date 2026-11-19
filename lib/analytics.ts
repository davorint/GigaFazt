/**
 * Funnel events (names fixed by SPEC.md) sent to Vercel Web Analytics (owner, 2026-11-19; no cookies, named in the
 * privacy notice). Custom events are recorded on Vercel's Pro plan; on Hobby only page views are, and this is a no-op
 * there. Properties are reduced to strings, numbers and booleans (what Vercel accepts); nothing a visitor typed is sent.
 */
import { track as vercelTrack } from "@vercel/analytics"

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

export function track(event: AnalyticsEvent, props: Record<string, unknown> = {}): void {
  const clean: Record<string, Prop> = {}
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string") clean[k] = v.slice(0, 100)
    else if (typeof v === "number" || typeof v === "boolean" || v === null) clean[k] = v
    else if (Array.isArray(v)) clean[k] = v.filter((x) => typeof x === "string" || typeof x === "number").join(",").slice(0, 100)
  }
  if (process.env.NODE_ENV !== "production") console.log(`[analytics] ${event}`, clean)
  try {
    vercelTrack(event, clean)
  } catch {
    // Analytics must never break a page.
  }
}
