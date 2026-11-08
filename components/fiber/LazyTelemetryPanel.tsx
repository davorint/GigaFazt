"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

// Measured loaded heights (2026-11-08 redesign): 953–1048 px (< 640, text wrap),
// 1057 px (640–767), 800 px (768–1023), 767 px (≥ 1024).
const MIN_H = "min-h-[1000px] sm:min-h-[1056px] md:min-h-[800px] lg:min-h-[768px]"

const TelemetryPanel = dynamic(() => import("./TelemetryPanel"), { ssr: false, loading: () => <IslandFrame className={MIN_H} /> })

/** Fetches the telemetry panel's chunk only when it nears the viewport. */
export function LazyTelemetryPanel() {
  return (
    <WhenVisible fallback={<IslandFrame className={MIN_H} />} className={MIN_H}>
      <TelemetryPanel />
    </WhenVisible>
  )
}
