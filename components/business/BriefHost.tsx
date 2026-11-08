"use client"

import dynamic from "next/dynamic"
import { useBrief } from "@/lib/brief"

const ProjectBrief = dynamic(() => import("./ProjectBrief"), { ssr: false })

/** One per /empresas page: mounts the project brief dialog on the first request (lib/brief). */
export function BriefHost() {
  const { open, request, preset, context } = useBrief((s) => s)
  if (request === 0) return null
  return <ProjectBrief open={open} request={request} preset={preset} context={context} />
}
