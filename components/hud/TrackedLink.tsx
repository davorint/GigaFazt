"use client"

import { track, type AnalyticsEvent } from "@/lib/analytics"

/** Plain <a> that fires an analytics event on click (for server-rendered links). */
export function TrackedLink({
  event,
  props,
  ...rest
}: React.ComponentProps<"a"> & { event: AnalyticsEvent; props?: Record<string, unknown> }) {
  return <a {...rest} onClick={() => track(event, props)} />
}
