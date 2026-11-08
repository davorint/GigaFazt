"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

// Measured loaded heights: set after the first production build (see PROGRESS).
const MIN_H = "min-h-[1200px] lg:min-h-[760px]"

const WifiLab = dynamic(() => import("./WifiLab"), { ssr: false, loading: () => <IslandFrame className={MIN_H} /> })

/** Fetches the Wi-Fi lab (and, from it, the wave simulation) only near the viewport. */
export function LazyWifiLab() {
  return (
    <WhenVisible fallback={<IslandFrame className={MIN_H} />} className={MIN_H}>
      <WifiLab />
    </WhenVisible>
  )
}
