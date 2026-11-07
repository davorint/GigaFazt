"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

// Measured loaded heights: 787 px (< 640), 736 px (640–1023), 453 px (≥ 1024).
const MIN_H = "min-h-[790px] sm:min-h-[740px] lg:min-h-[455px]"

const TelemetryPanel = dynamic(() => import("./TelemetryPanel"), { ssr: false, loading: () => <IslandFrame className={MIN_H} /> })

/** Fetches the telemetry panel's chunk only when it nears the viewport. */
export function LazyTelemetryPanel() {
  return (
    <WhenVisible fallback={<IslandFrame className={MIN_H} />} className={MIN_H}>
      <TelemetryPanel />
    </WhenVisible>
  )
}
