"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

const MIN_H = 400

const LatencyPhysics = dynamic(() => import("./LatencyPhysics"), { ssr: false, loading: () => <IslandFrame minHeight={MIN_H} /> })

/** Fetches the latency widget (and the Slider primitive) only near the viewport. */
export function LazyLatencyPhysics() {
  return (
    <WhenVisible fallback={<IslandFrame minHeight={MIN_H} />} minHeight={MIN_H}>
      <LatencyPhysics />
    </WhenVisible>
  )
}
