"use client"

import { useTranslations } from "next-intl"
import { ArrowRight, Building2 } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { SimTag } from "@/components/hud/SimTag"
import { clientsByState } from "@/lib/clients"
import { STATES } from "@/lib/geo/states"
import { scrollToId } from "@/lib/scroll"
import { requestMapFocus } from "@/lib/map-focus"
import { track } from "@/lib/analytics"

/**
 * Text equivalent of the map (hard rule #9, SPEC §5): service states and the
 * client buildings in each. Each client is a button that locates it on the map.
 */
export function ClientList() {
  const t = useTranslations("map")

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-[-0.02em]">{t("listTitle")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("listDesc")}</p>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {STATES.map((s) => {
          const list = clientsByState(s.code)
          return (
            <li key={s.code} className="rounded-xl border border-border bg-surface p-5">
              <button
                type="button"
                onClick={() => {
                  scrollToId("map")
                  requestMapFocus({ kind: "state", id: s.code })
                }}
                className="rounded-md text-left font-medium hover:text-fiber focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {s.name}
              </button>
              <p className="font-mono text-[0.65rem] uppercase tracking-wider text-ok">{t("legend.zone")}</p>
              <Link
                href={`/cobertura/${s.slug}`}
                onClick={() => track("map_region_opened", { slug: s.slug })}
                className="mt-2 inline-flex items-center gap-1 rounded font-mono text-[0.7rem] text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t("statePage", { name: s.name })}
                <ArrowRight className="size-3" aria-hidden />
              </Link>
              {list.length > 0 && (
                <ul className="mt-3 space-y-1">
                  {list.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          scrollToId("map")
                          requestMapFocus({ kind: "client", id: c.id })
                        }}
                        className="flex w-full flex-wrap items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Building2 className="size-4 text-fiber" aria-hidden />
                        <span>{c.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{c.area}</span>
                        {c.demo && <SimTag kind="demo" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("approx")}</p>
    </div>
  )
}
