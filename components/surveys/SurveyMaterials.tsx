"use client"

import { useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { mxn, type Item, type Role } from "@/lib/materials/catalog"
import { catalogServerSnapshot, catalogSnapshot, subscribeCatalog } from "@/lib/materials/store"
import { newId } from "@/lib/survey/id"
import { designNeeds, surveyCosts, type CostLine, type SurveyMaterials } from "@/lib/survey/materials"
import { AddButton, PickField } from "./SurveyFields"
import type { SectionProps } from "./SurveySections"

type T = ReturnType<typeof useTranslations>
const SMALL_BTN = "min-h-9 rounded-full border border-white/15 px-3 text-xs text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** Materials and cost of this project, priced from the master list (IVA included). */
export function MaterialsSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos.materials")
  const tr = useTranslations("materiales")
  const store = useSyncExternalStore(subscribeCatalog, catalogSnapshot, catalogServerSnapshot)
  if (!store.loaded) return null
  const catalog = store.items
  const m = s.materials
  const setM = (p: Partial<SurveyMaterials>) => set({ ...s, materials: { ...m, ...p } })
  const c = surveyCosts(s, catalog)
  const need = designNeeds(s)
  const hasDesign = s.towers.some((x) => x.design)
  const roleLine = (x: CostLine, computed: number | undefined) => (
    <RoleLine
      key={x.key}
      t={t}
      tr={tr}
      line={x}
      computed={computed ?? 0}
      options={catalog.filter((it) => it.role === x.role)}
      onPick={(id) => setM({ pick: { ...m.pick, [x.role!]: id } })}
      onQty={(q) => {
        const qty = { ...m.qty }
        if (q === null || q === computed) delete qty[x.role!]
        else qty[x.role!] = q
        setM({ qty })
      }}
    />
  )
  return (
    <div className="grid gap-6">
      <p className="text-sm leading-relaxed text-zinc-300">
        {t("intro")}{" "}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it) */}
        <a href="/interno/materiales" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
          {t("catalogLink")}
        </a>
      </p>
      <div className="grid gap-3">
        <h4 className="text-base font-medium text-foreground">{t("buildTitle")}</h4>
        {!hasDesign && <p className="text-sm text-zinc-400">{t("noDesign")}</p>}
        {c.build.map((x) => roleLine(x, need.build[x.role!]))}
      </div>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <h4 className="text-base font-medium text-foreground">{t("extrasTitle")}</h4>
          <p className="text-xs text-zinc-400">{t("extrasHint")}</p>
        </div>
        {c.extras.map((x) => {
          const ex = m.extras.find((e) => e.id === x.key)!
          return (
            <div key={x.key} className="grid gap-3 rounded-xl border border-white/10 p-3">
              <div className="grid items-start gap-3 sm:grid-cols-[1fr_10rem]">
                <PickField label={t("item")} value={ex.itemId} onChange={(v) => setM({ extras: m.extras.map((e) => (e.id === ex.id ? { ...e, itemId: v } : e)) })} options={catalog.map((it) => ({ value: it.id, label: it.name }))} />
                <NumberField label={t("qty")} unit={x.item?.unit ?? ""} max={1e7} value={ex.qty} onChange={(v) => v !== null && setM({ extras: m.extras.map((e) => (e.id === ex.id ? { ...e, qty: v } : e)) })} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Price t={t} line={x} />
                <button type="button" className={SMALL_BTN} onClick={() => setM({ extras: m.extras.filter((e) => e.id !== ex.id) })}>
                  {t("remove")}
                </button>
              </div>
            </div>
          )
        })}
        <AddButton disabled={!catalog.length || m.extras.length >= 200} onClick={() => setM({ extras: [...m.extras, { id: newId(), itemId: catalog[0].id, qty: 1, note: "" }] })}>
          {t("addExtra")}
        </AddButton>
      </div>
      <div className="grid gap-3">
        <div className="grid gap-1">
          <h4 className="text-base font-medium text-foreground">{t("clientTitle")}</h4>
          <p className="text-xs text-zinc-400">{t("clientHint")}</p>
        </div>
        {c.client.map((x) => roleLine(x, need.client[x.role!]))}
      </div>
      <div className="grid gap-2 rounded-xl border border-white/15 bg-white/[0.03] p-4" aria-live="polite">
        <h4 className="text-base font-medium text-foreground">{t("totalsTitle")}</h4>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-zinc-300">{t("buildTotal")}</dt>
          <dd className="text-right font-mono text-zinc-100">{mxn(c.buildTotal)}</dd>
          <dt className="text-zinc-300">{t("perClient")}</dt>
          <dd className="text-right font-mono text-zinc-100">{mxn(c.perClient)}</dd>
          <dt className="text-zinc-300">
            {t("clientsTotal")} ({t("clients", { n: c.clients })})
          </dt>
          <dd className="text-right font-mono text-zinc-100">{mxn(c.clientsTotal)}</dd>
          <dt className="border-t border-white/10 pt-1.5 font-medium text-foreground">{t("total")}</dt>
          <dd className="border-t border-white/10 pt-1.5 text-right font-mono font-medium text-foreground">{mxn(c.total)}</dd>
        </dl>
        {!c.clients && <p className="text-xs text-zinc-400">{t("noClients")}</p>}
        {c.missing > 0 && <p className="text-xs text-amber-200">{t("missing", { n: c.missing })}</p>}
      </div>
    </div>
  )
}

function Price({ t, line }: { t: T; line: CostLine }) {
  return (
    <p className="font-mono text-xs text-zinc-300">
      {line.item && line.item.price !== null ? t("each", { price: mxn(line.item.price) }) : <span className="text-amber-200">{t("noPrice")}</span>}
      {line.total !== null && <span className="text-zinc-100"> · {mxn(line.total)}</span>}
    </p>
  )
}

function RoleLine({ t, tr, line, computed, options, onPick, onQty }: { t: T; tr: T; line: CostLine; computed: number; options: Item[]; onPick: (id: string) => void; onQty: (q: number | null) => void }) {
  const role = line.role as Role
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 p-3">
      <p className="text-sm text-zinc-100">{tr(`roles.${role}`)}</p>
      {options.length ? (
        <div className="grid items-start gap-3 sm:grid-cols-[1fr_10rem]">
          <PickField label={t("item")} value={line.item?.id ?? ""} onChange={onPick} options={options.map((it) => ({ value: it.id, label: it.name }))} />
          <NumberField label={t("qty")} unit={line.item?.unit ?? ""} optional max={1e7} value={line.qty} onChange={onQty} hint={line.qty !== computed ? t("computed", { n: computed }) : undefined} />
        </div>
      ) : (
        <p className="text-xs text-amber-200">{t("missingItem")}</p>
      )}
      <Price t={t} line={line} />
    </div>
  )
}
