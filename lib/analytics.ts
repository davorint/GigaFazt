/**
 * Thin analytics shim. No-op (console.log in dev) until a provider is wired via
 * BUSINESS.md → Integrations → Analytics. Event names are fixed by SPEC.md.
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

export function track(
  event: AnalyticsEvent,
  props: Record<string, unknown> = {}
): void {
  if (process.env.NODE_ENV !== "production") {
    // Dev-only visibility until an analytics provider is configured.
    console.log(`[analytics] ${event}`, props)
  }
  // When a provider is configured, dispatch here.
}
