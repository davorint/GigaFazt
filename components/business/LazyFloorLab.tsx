"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"

/** Measured heights of the loaded lab (390 / 640 / 1024 / 1280+ px), so the swap doesn't shift layout. */
const FRAME = "min-h-[1022px] sm:min-h-[1068px] lg:min-h-[685px] xl:min-h-[659px]"

const FloorLab = dynamic(() => import("./FloorLab"), {
  ssr: false,
  loading: () => <div aria-hidden className={`biz-frame ${FRAME}`} />,
})

/** The floor lab loads only near the viewport (keeps it out of the first load). */
export function LazyFloorLab() {
  return (
    <WhenVisible className={FRAME} fallback={<div aria-hidden className={`biz-frame ${FRAME}`} />}>
      <FloorLab />
    </WhenVisible>
  )
}
