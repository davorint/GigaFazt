"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { PAY_CATEGORIES, lookalike, newPayable, recurringBills, type PayCategory, type Payable } from "@/lib/finance/payables"
import { agingTotals, balanceOf, complementPending, finStatus, isOpenDoc, type FinStatus } from "@/lib/finance/common"
import { payablesStore } from "@/lib/finance/store"
import { providerName } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { siteLabel } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { mxn } from "@/lib/materials/catalog"
import { localToday } from "@/lib/clients/from-lead"
import { readState } from "@/lib/sync/state"
import { AgingTiles, CfdiEditor, DANGER, PaymentsEditor, SMALL, STATUS_TONE, Tile } from "./FinParts"

type T = ReturnType<typeof useTranslations>
const SHOWS = ["abiertas", "vencidas", "pagadas", "todas"] as const
type Show = (typeof SHOWS)[number]
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** /interno/admin/cuentas-por-pagar: what we owe, when, to whom, and what's been paid. */
export function PayablesApp() {
  const t = useTranslations("cuentas")
  const store = useSyncExternalStore(payablesStore.subscribe, payablesStore.snapshot, payablesStore.serverSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list
  const [show, setShow] = useState<Show>("abiertas")
  const [cat, setCat] = useState<PayCategory | "">("")
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useOpenParam("p")
  if (!store.loaded || !sites.loaded) return null
  const today = localToday()
  const month = today.slice(0, 7)
  const list = store.list
  const st = (x: Payable): FinStatus => finStatus(x, today)
  const open = list.filter(isOpenDoc)
  const fixed = recurringBills(month, sites.list, providers).filter((b) => !list.some((x) => x.id === b.id))
  // Typed by hand already (same category, month, deployment, carrier): not offered as missing, shown to check.
  const doubts = fixed.map((b) => ({ b, like: lookalike(b, list) })).filter((d) => d.like)
  const missing = fixed.filter((b) => !doubts.some((d) => d.b.id === b.id))
  const addFixed = (bills: Payable[]) => payablesStore.save(...bills.map((b) => ({ ...b, by: readState().name, updatedAt: new Date().toISOString() })))
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const shown = list
    .filter((x) => x.id === openId || show === "todas" || (show === "abiertas" ? isOpenDoc(x) : show === "vencidas" ? st(x) === "vencido" : st(x) === "pagado"))
    .filter((x) => x.id === openId || !cat || x.category === cat)
    .filter((x) => x.id === openId || !q.trim() || fold([x.concept, x.payee, providerName(providers.find((p) => p.id === x.providerId) ?? { tradeName: "", legalName: "" } as never), x.notes, x.cfdi.uuid].join(" ")).includes(fold(q.trim())))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || a.concept.localeCompare(b.concept, "es"))
  const sum = (xs: Payable[]) => xs.reduce((a, x) => a + balanceOf(x), 0)
  const paidThisMonth = list.reduce((a, x) => a + x.payments.filter((p) => p.date.slice(0, 7) === month).reduce((b, p) => b + p.amount, 0), 0)
  const cfdiPending = list.filter((x) => !x.cancelled && complementPending(x)).length
  const add = (v: Record<string, string>) => {
    const category = (PAY_CATEGORIES as readonly string[]).includes(v.category) ? (v.category as PayCategory) : "otro"
    const x = newPayable({ concept: v.concept.trim(), payee: v.payee.trim(), category, amount: Number(v.amount) || 0, issueDate: today, dueDate: today, by: readState().name, updatedAt: new Date().toISOString() })
    payablesStore.save(x)
    setOpenId(x.id)
  }
  return (
    <div className="mt-6 grid gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label={t("pagar.tiles.open")} value={mxn(sum(open))} hint={t("count", { n: open.length })} />
        <Tile label={t("pagar.tiles.late")} value={mxn(sum(open.filter((x) => st(x) === "vencido")))} tone="text-red-300" />
        <Tile label={t("pagar.tiles.week")} value={mxn(sum(open.filter((x) => x.dueDate >= today && x.dueDate <= plusDays(today, 7))))} />
        <Tile label={t("pagar.tiles.paid")} value={mxn(paidThisMonth)} />
        <Tile label={t("tiles.cfdi")} value={String(cfdiPending)} hint={t("pagar.tiles.cfdiHint")} tone={cfdiPending ? "text-amber-200" : ""} />
      </div>
      <section aria-label={t("aging.title")} className="grid gap-2">
        <h2 className="text-sm font-medium text-foreground">{t("aging.title")}</h2>
        <AgingTiles t={t} totals={agingTotals(open.map((x) => ({ due: x.dueDate, amount: balanceOf(x) })), today)} />
      </section>

      {(missing.length > 0 || doubts.length > 0) && (
        <div className="grid gap-2 rounded-xl border border-cyan-400/30 p-3">
          {missing.length > 0 && (
            <>
              <p className="text-sm text-cyan-100">{t("pagar.recurring", { n: missing.length, total: mxn(missing.reduce((a, b) => a + b.amount, 0)) })}</p>
              <p className="text-xs text-zinc-400">{missing.map((b) => b.concept).join(" · ")}</p>
              <button type="button" onClick={() => addFixed(missing)} className={SMALL}>
                {t("pagar.recurringAdd")}
              </button>
            </>
          )}
          {doubts.length > 0 && (
            <>
              <p className="text-xs text-amber-200">{t("pagar.recurringDoubt", { n: doubts.length })}</p>
              <ul className="grid gap-1 text-xs text-zinc-300">
                {doubts.map((d) => (
                  <li key={d.b.id}>{t("pagar.recurringLike", { fixed: d.b.concept, like: d.like!.concept || d.like!.payee })}</li>
                ))}
              </ul>
              <button type="button" onClick={() => addFixed(doubts.map((d) => d.b))} className={SMALL}>
                {t("pagar.recurringAddAnyway", { n: doubts.length })}
              </button>
            </>
          )}
        </div>
      )}

      <QuickAdd
        title={t("pagar.add")}
        submit={t("pagar.addSubmit")}
        fields={[
          { key: "concept", label: t("concept"), required: true, placeholder: t("pagar.conceptPlaceholder") },
          { key: "payee", label: t("pagar.payee") },
          { key: "amount", label: t("amount"), kind: "number", min: 0 },
          { key: "category", label: t("category"), kind: "select", options: PAY_CATEGORIES.map((c) => ({ value: c, label: t(`pagar.categories.${c}`) })) },
        ]}
        onAdd={add}
      />

      <div className="grid items-start gap-3 sm:grid-cols-3">
        <PickField label={t("show")} value={show} onChange={setShow} options={SHOWS.map((s) => ({ value: s, label: t(`shows.${s}`) }))} />
        <PickField label={t("category")} value={cat} onChange={setCat} options={[{ value: "" as const, label: t("allCategories") }, ...PAY_CATEGORIES.map((c) => ({ value: c, label: t(`pagar.categories.${c}`) }))]} />
        <TextField label={t("search")} value={q} onChange={setQ} />
      </div>
      {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((x) => (
          <li key={x.id}>
            <PayableRow t={t} x={x} status={st(x)} today={today} open={openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)} providers={providers} sites={sites.list} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function PayableRow({ t, x, status, today, open, onToggle, providers, sites }: { t: T; x: Payable; status: FinStatus; today: string; open: boolean; onToggle: () => void; providers: ReturnType<typeof providersSnapshot>["list"]; sites: ReturnType<typeof sitesSnapshot>["list"] }) {
  const up = (p: Partial<Payable>) => payablesStore.save({ ...x, ...p, updatedAt: new Date().toISOString() })
  const named = providers.find((p) => p.id === x.providerId)
  const who = named ? providerName(named) : x.payee
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{x.concept || t("noConcept")}</span>
          <span className="font-mono text-xs text-zinc-400">{[who, x.dueDate ? t("dueOn", { date: x.dueDate }) : t("noDue"), t(`pagar.categories.${x.category}`)].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="grid shrink-0 justify-items-end gap-1">
          <span className="font-mono text-sm text-zinc-100">{mxn(balanceOf(x))}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[status]}`}>{t(`statuses.${status}`)}</span>
        </span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-white/10 p-3">
          <div className={GRID}>
            <PickField label={t("pagar.provider")} value={x.providerId} onChange={(providerId) => up({ providerId })} hint={t("pagar.providerHint")} options={[{ value: "", label: t("pagar.noProvider") }, ...providers.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 6) }))]} />
            {!named && <TextField label={t("pagar.payee")} value={x.payee} onChange={(payee) => up({ payee: payee.slice(0, 200) })} />}
            <TextField label={t("concept")} value={x.concept} onChange={(concept) => up({ concept: concept.slice(0, 300) })} />
            <PickField label={t("category")} value={x.category} onChange={(category) => up({ category })} options={PAY_CATEGORIES.map((c) => ({ value: c, label: t(`pagar.categories.${c}`) }))} />
            <NumberField label={t("amount")} unit="MXN" optional max={1e9} precision={2} value={x.amount || null} onChange={(v) => up({ amount: v ?? 0 })} hint={t("ivaHint")} />
            <PickField label={t("pagar.site")} value={x.siteId} onChange={(siteId) => up({ siteId })} options={[{ value: "", label: t("pagar.noSite") }, ...sites.map((s) => ({ value: s.id, label: siteLabel(s) }))]} />
            <DateField label={t("issueDate")} value={x.issueDate} onChange={(issueDate) => up({ issueDate })} />
            <DateField label={t("dueDate")} value={x.dueDate} onChange={(dueDate) => up({ dueDate })} />
          </div>
          <PaymentsEditor t={t} doc={x} side="pagar" today={today} onChange={(payments) => up({ payments })} />
          <CfdiEditor t={t} doc={x} side="pagar" today={today} onChange={(cfdi) => up({ cfdi })} />
          <AreaField label={t("notes")} value={x.notes} onChange={(notes) => up({ notes })} rows={2} />
          <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={x.cancelled} onChange={(e) => up({ cancelled: e.target.checked })} className="size-5 accent-white" />
            {t("cancelled")}
          </label>
          <RecordHistory kind="porpagar" id={x.id} />
          <button type="button" onClick={() => window.confirm(t("confirmRemove")) && payablesStore.remove(x.id)} className={DANGER}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}
