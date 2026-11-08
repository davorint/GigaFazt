"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"
import { IslandFrame } from "@/components/layout/IslandFrame"

// Measured loaded heights (2026-11-08, with the "Tu módem" option): 1523 px
// (< 640), 1566 px (640–767), 1600–1768 px (768–1023), 796–831 px (≥ 1024).
const MIN_H = "min-h-[1520px] sm:min-h-[1566px] md:min-h-[1650px] lg:min-h-[800px]"

const WifiLab = dynamic(() => import("./WifiLab"), { ssr: false, loading: () => <IslandFrame className={MIN_H} /> })

/** Fetches the Wi-Fi lab (and, from it, the wave simulation) only near the viewport. */
export function LazyWifiLab() {
  return (
    <WhenVisible fallback={<IslandFrame className={MIN_H} />} className={MIN_H}>
      <WifiLab />
    </WhenVisible>
  )
}
