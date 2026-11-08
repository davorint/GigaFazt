"use client"

import { track } from "@/lib/analytics"
import { brief, type BriefPreset } from "@/lib/brief"

/**
 * A WhatsApp link that, once the page is interactive, opens the project brief
 * instead (lib/brief), so the chat starts with a structured summary. Without
 * JS (or modified clicks: new tab/window) it stays a plain WhatsApp link.
 */
export function QuoteLink({
  preset,
  context,
  ...rest
}: React.ComponentProps<"a"> & { preset?: BriefPreset; context: string }) {
  return (
    <a
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
          track("whatsapp_clicked", { context, brief: false })
          return
        }
        e.preventDefault()
        track("brief_opened", { context })
        brief.open(preset, context)
      }}
    />
  )
}
