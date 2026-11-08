"use client"

import { useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { Building2, MapPinned, X } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { SimTag } from "@/components/hud/SimTag"
import { clients, clientsByState } from "@/lib/clients"
import { STATES } from "@/lib/geo/states"
import { selection } from "@/lib/selection"
import { scrollToId } from "@/lib/scroll"
import { track } from "@/lib/analytics"
import type { StateCode } from "@/lib/types"
import { stateName } from "@/lib/geo/state-names"

export type MapTarget = { kind: "client"; id: string } | { kind: "state"; id: string }

/**
 * Glass HUD card for the hovered or pinned map target (SPEC §5). Pinned cards
 * get a close button and the conversion CTAs (contract → lead Sheet, plans).
 */
export function MapHud({
  target,
  pinned,
  onClose,
  autoFocus = false,
  className,
}: {
  target: MapTarget
  pinned: boolean
  onClose: () => void
  /** Move focus into the card (when pinned from the keyboard-usable list). */
  autoFocus?: boolean
  className?: string
}) {
  const t = useTranslations("map.hud")
  const tm = useTranslations("map")
  const ts = useTranslations("states")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (pinned && autoFocus) ref.current?.focus()
  }, [pinned, autoFocus, target.id])

  const client = target.kind === "client" ? clients.find((c) => c.id === target.id) : undefined
  const state = STATES.find((s) => s.code === (client ? client.state : (target.id as StateCode)))
  if (!state) return null

  const inState = clientsByState(state.code)
  const real = inState.filter((c) => !c.demo).length
  const demo = inState.length - real

  return (
    <div
      ref={ref}
      tabIndex={pinned ? -1 : undefined}
      role={pinned ? "group" : undefined}
      aria-label={pinned ? (client ? client.name : stateName(ts, state.slug)) : undefined}
      onKeyDown={(e) => {
        if (pinned && e.key === "Escape") onClose()
      }}
      className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring", 
        "md:w-72 rounded-lg border border-border bg-background/80 p-4 text-sm shadow-lg backdrop-blur-md",
        pinned ? "pointer-events-auto" : "pointer-events-none",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow flex items-center gap-1.5 text-[0.6rem]">
          {client ? <Building2 className="size-3.5 text-fiber" aria-hidden /> : <MapPinned className="size-3.5 text-fiber" aria-hidden />}
          {client ? t("client") : t("zone")}
        </p>
        {pinned && (
          <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-2" aria-label={tm("close")} onClick={onClose}>
            <X />
          </Button>
        )}
      </div>

      {client ? (
        <>
          <p className="mt-2 text-base font-semibold">{client.name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            {client.area} · {stateName(ts, state.slug)}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t("residential")}
            {client.demo && <SimTag kind="demo" />}
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-base font-semibold">{stateName(ts, state.slug)}</p>
          <p className="text-xs text-muted-foreground">{ts(`${state.slug}.scope`)}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{t("clientsHere", { count: real })}</p>
          {demo > 0 && (
            <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
              {t("demoHere", { count: demo })}
              <SimTag kind="demo" />
            </p>
          )}
        </>
      )}

      {pinned && (
        <>
          <p className="mt-3 text-xs text-muted-foreground">{t("confirm")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              className=""
              onClick={() => {
                track("plan_selected", { context: "map", state: state.code })
                selection.openLead()
              }}
            >
              {t("contract")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => scrollToId("plans")}>
              {t("viewPlans")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
