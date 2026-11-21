"use client"

import { useTranslations } from "next-intl"
import { Tile } from "@/components/finance/FinParts"
import { localToday } from "@/lib/clients/from-lead"
import { ledger } from "@/lib/payments/model"
import { cutLists } from "@/lib/wispdavor/cortes"
import { WISPDAVOR_PAGES } from "@/lib/wispdavor/pages"
import { waNumber } from "@/lib/wispdavor/whatsapp"
import { useWispData } from "./useWispData"

const EXISTING: [string, string][] = [
  ["clientes", "/interno/admin/clientes"],
  ["reportes", "/interno/admin/reportes_clientes"],
  ["agenda", "/interno/admin/agenda"],
  ["despliegues", "/interno/admin/despliegues"],
  ["materiales", "/interno/materiales/en-existencia"],
  ["contratos", "/interno/admin/legal/contratos"],
  ["numeros", "/interno/admin/numeros"],
  ["mikrotik", "/interno/equipos-telecom/mikrotik/scripts"],
]

/** /interno/software/wispdavor: where things stand, the modules, and what the rest of /interno already covers. */
export function WispHubApp() {
  const t = useTranslations("wispdavor")
  const d = useWispData()
  if (!d.loaded) return null
  const today = localToday()
  const withService = d.clients.filter((c) => c.services.some((s) => s.status !== "cancelado"))
  const late = withService.filter((c) => ledger(c, d.payments, today).status === "atrasado")
  const cuts = cutLists(d.clients, d.payments, today)
  const noPhone = withService.filter((c) => !waNumber(c.whatsapp || c.phone))
  return (
    <div className="mt-6 grid gap-10">
      {!d.clients.length && <p className="text-sm text-amber-200">{t("noData")}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label={t("tiles.active")} value={String(withService.length)} />
        <Tile label={t("tiles.late")} value={String(late.length)} tone={late.length ? "text-red-300" : ""} />
        <Tile label={t("tiles.cut")} value={String(cuts.cut.length)} tone={cuts.cut.length ? "text-amber-200" : ""} />
        <Tile label={t("tiles.restore")} value={String(cuts.restore.length)} tone={cuts.restore.length ? "text-emerald-300" : ""} />
        <Tile label={t("tiles.noPhone")} value={String(noPhone.length)} />
      </div>
      <section aria-labelledby="wd-modules" className="grid gap-3">
        <h2 id="wd-modules" className="text-xl font-light text-foreground">
          {t("modules.title")}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {WISPDAVOR_PAGES.map((p) => (
            <li key={p}>
              <a href={`/interno/software/wispdavor/${p}`} className="surface grid h-full gap-2 rounded-2xl p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className="text-lg font-medium text-foreground">{t(`modules.${p}.name`)}</span>
                <span className="text-sm leading-relaxed text-zinc-300">{t(`modules.${p}.desc`)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="wd-existing" className="grid gap-3">
        <h2 id="wd-existing" className="text-xl font-light text-foreground">
          {t("existing.title")}
        </h2>
        <p className="text-sm text-zinc-400">{t("existing.lead")}</p>
        <ul className="flex flex-wrap gap-2">
          {EXISTING.map(([k, href]) => (
            <li key={k}>
              <a href={href} className="inline-flex min-h-9 items-center rounded-full border border-white/15 px-3 text-sm text-zinc-200 hover:bg-white/5">
                {t(`existing.links.${k}`)}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="wd-next" className="grid gap-2">
        <h2 id="wd-next" className="text-xl font-light text-foreground">
          {t("next.title")}
        </h2>
        <ul className="grid list-disc gap-1 pl-5 text-sm text-zinc-300">
          {(t.raw("next.items") as string[]).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
