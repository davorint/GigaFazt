"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"

const Frame = () => (
  <div aria-hidden className="h-[540px] md:h-[clamp(680px,88svh,900px)]" />
)

// MapLibre (+ its CSS) loads only within one viewport of the map (SPEC perf rules).
const CoverageMap = dynamic(() => import("./CoverageMap"), { ssr: false, loading: Frame })

export function LazyCoverageMap() {
  return (
    <WhenVisible fallback={<Frame />} rootMargin="100% 0px">
      <CoverageMap />
    </WhenVisible>
  )
}
