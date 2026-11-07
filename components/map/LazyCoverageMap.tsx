"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"

const Frame = () => (
  <div aria-hidden className="h-[460px] rounded-xl border border-border bg-surface md:h-[580px]" />
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
