"use client"

import dynamic from "next/dynamic"
import { WhenVisible } from "@/components/layout/WhenVisible"

/** Measured heights of the loaded panel (390 / 640 / 1024+ px), so the swap doesn't shift layout. */
const FRAME = "min-h-[946px] sm:min-h-[1019px] lg:min-h-[563px] xl:min-h-[650px]"

const NocPanel = dynamic(() => import("./NocPanel"), {
  ssr: false,
  loading: () => <div aria-hidden className={`biz-frame ${FRAME}`} />,
})

/** The NOC panel loads only near the viewport (keeps it out of the first load). */
export function LazyNoc() {
  return (
    <WhenVisible className={FRAME} fallback={<div aria-hidden className={`biz-frame ${FRAME}`} />}>
      <NocPanel />
    </WhenVisible>
  )
}
