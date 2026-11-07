"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

const MIN_H = 420

const TelemetryPanel = dynamic(() => import("./TelemetryPanel"), { ssr: false, loading: () => <IslandFrame minHeight={MIN_H} /> })

/** Fetches the telemetry panel's chunk only when it nears the viewport. */
export function LazyTelemetryPanel() {
  return (
    <WhenVisible fallback={<IslandFrame minHeight={MIN_H} />} minHeight={MIN_H}>
      <TelemetryPanel />
    </WhenVisible>
  )
}
