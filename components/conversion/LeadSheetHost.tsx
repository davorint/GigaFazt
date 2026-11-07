"use client"

import dynamic from "next/dynamic"
import { useSelection } from "@/lib/selection"

// Lazy: the Sheet, react-hook-form and zod load on the first "Contratar"
// click, never in the initial bundle (perf budget, hard rule #8).
const LeadSheet = dynamic(() => import("./LeadSheet"), { ssr: false })

/** Mount once per page; renders the lead Sheet after the first request. */
export function LeadSheetHost() {
  const requested = useSelection((s) => s.leadRequest > 0)
  return requested ? <LeadSheet /> : null
}
