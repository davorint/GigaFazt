"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

// Measured loaded heights: 593 px (360 wide), 441 px (640–1023); on lg the grid row is taller.
const MIN_H = "min-h-[595px] sm:min-h-[445px] lg:min-h-[400px]"

const LatencyPhysics = dynamic(() => import("./LatencyPhysics"), { ssr: false, loading: () => <IslandFrame className={MIN_H} /> })

/** Fetches the latency widget (and the Slider primitive) only near the viewport. */
export function LazyLatencyPhysics() {
  return (
    <WhenVisible fallback={<IslandFrame className={MIN_H} />} className={MIN_H}>
      <LatencyPhysics />
    </WhenVisible>
  )
}
