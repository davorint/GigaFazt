"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

// Measured loaded heights (2026-11-08, latency physics now inside the panel):
// 1569–1664 px (< 640, text wrap), 1520 px (640–767), 1213–1263 px (768–1023),
// 1213 px (≥ 1024).
const MIN_H = "min-h-[1600px] sm:min-h-[1520px] md:min-h-[1240px] lg:min-h-[1213px]"

const TelemetryPanel = dynamic(() => import("./TelemetryPanel"), { ssr: false, loading: () => <IslandFrame className={MIN_H} /> })

/** Fetches the telemetry panel's chunk only when it nears the viewport. */
export function LazyTelemetryPanel() {
  return (
    <WhenVisible fallback={<IslandFrame className={MIN_H} />} className={MIN_H}>
      <TelemetryPanel />
    </WhenVisible>
  )
}
