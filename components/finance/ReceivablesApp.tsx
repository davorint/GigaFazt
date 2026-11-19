"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { ClientPick } from "@/components/clients/ClientPick"
import { CHARGE_CATEGORIES, newReceivable, serviceReceivables, type ChargeCategory, type Receivable } from "@/lib/finance/receivables"
import { agingTotals, balanceOf, complementPending, finStatus, type FinStatus } from "@/lib/finance/common"
import { receivablesStore } from "@/lib/finance/store"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { clientLabel } from "@/lib/clients/model"
import { paymentsStore } from "@/lib/payments/store"
import { mxn } from "@/lib/materials/catalog"
import { localToday } from "@/lib/clients/from-lead"
import { readState } from "@/lib/sync/state"
import { AgingTiles, CfdiEditor, DANGER, PaymentsEditor, STATUS_TONE, Tile } from "./FinParts"

type T = ReturnType<typeof useTranslations>
const SHOWS = ["abiertas", "vencidas", "pagadas", "todas"] as const
type Show = (typeof SHOWS)[number]

/** /interno/admin/cuentas-por-cobrar: every amount owed to us, the one-off charges and the monthly service balances. */
export function ReceivablesApp() {
  const t = useTranslations("cuentas")
  const store = useSyncExternalStore(receivablesStore.subscribe, receivablesStore.snapshot, receivablesStore.serverSnapshot)
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot)
  const [show, setShow] = useState<Show>("abiertas")
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useOpenParam("c")
  if (!store.loaded || !clients.loaded || !payments.loaded) return null
  const today = localToday()
  const month = today.slice(0, 7)
  const list = store.list
  const st = (x: Receivable): FinStatus => finStatus(x, today)
  const open = list.filter((x) => !x.cancelled && balanceOf(x) > 0.005)
  const service = serviceReceivables(clients.list, payments.list, today)
  const serviceTotal = service.reduce((a, s) => a + s.amount, 0)
  const chargesTotal = open.reduce((a, x) => a + balanceOf(x), 0)
  const items = [...open.map((x) => ({ due: x.dueDate, amount: balanceOf(x) })), ...service.map((s) => ({ due: s.due, amount: s.amount }))]
  const aging = agingTotals(items, today)
  const overdue = aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d90
  const collected = list.reduce((a, x) => a + x.payments.filter((p) => p.date.slice(0, 7) === month).reduce((b, p) => b + p.amount, 0), 0) + payments.list.filter((p) => p.date.slice(0, 7) === month).reduce((a, p) => a + p.amount, 0)
  const cfdiPending = list.filter((x) => !x.cancelled && complementPending(x)).length
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
  const nameOf = (x: Receivable) => {
    const c = clients.list.find((y) => y.id === x.clientId)
    return c ? clientLabel(c) : x.payer
  }
  const shown = list
    .filter((x) => (show === "todas" ? true : show === "abiertas" ? !x.cancelled && balanceOf(x) > 0.005 : show === "vencidas" ? st(x) === "vencido" : st(x) === "pagado"))
    .filter((x) => !q.trim() || fold([x.concept, nameOf(x), x.notes, x.cfdi.uuid].join(" ")).includes(fold(q.trim())))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
  // Monthly service per client: total owed and the oldest month due.
  const byClient = [...new Map(service.map((s) => [s.clientId, s])).keys()].map((id) => {
    const mine = service.filter((s) => s.clientId === id)
    return { id, name: mine[0].name, amount: mine.reduce((a, s) => a + s.amount, 0), oldest: mine[0].due, months: mine.length }
  }).sort((a, b) => a.oldest.localeCompare(b.oldest) || b.amount - a.amount)
  const add = (v: Record<string, string>) => {
    const category = (CHARGE_CATEGORIES as readonly string[]).includes(v.category) ? (v.category as ChargeCategory) : "otro"
    const x = newReceivable({ concept: v.concept.trim(), payer: v.payer.trim(), category, amount: Number(v.amount) || 0, issueDate: today, dueDate: today, by: readState().name, updatedAt: new Date().toISOString() })
    receivablesStore.save(x)
    setOpenId(x.id)
  }
  return (
    <div className="mt-6 grid gap-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label={t("cobrar.tiles.open")} value={mxn(chargesTotal + serviceTotal)} hint={t("cobrar.tiles.split", { charges: mxn(chargesTotal), service: mxn(serviceTotal) })} />
        <Tile label={t("cobrar.tiles.late")} value={mxn(overdue)} tone={overdue > 0 ? "text-red-300" : ""} />
        <Tile label={t("cobrar.tiles.collected")} value={mxn(collected)} />
        <Tile label={t("cobrar.tiles.clients")} value={String(byClient.length)} hint={t("cobrar.tiles.clientsHint")} />
        <Tile label={t("tiles.cfdi")} value={String(cfdiPending)} hint={t("cobrar.tiles.cfdiHint")} tone={cfdiPending ? "text-amber-200" : ""} />
      </div>
      <section aria-label={t("aging.title")} className="grid gap-2">
        <h2 className="text-sm font-medium text-foreground">{t("aging.title")}</h2>
        <AgingTiles t={t} totals={aging} />
      </section>

      <section aria-label={t("cobrar.chargesTitle")} className="grid gap-4">
        <h2 className="text-base font-medium text-foreground">{t("cobrar.chargesTitle")}</h2>
        <p className="text-xs text-zinc-400">{t("cobrar.chargesHint")}</p>
        <QuickAdd
          title={t("cobrar.add")}
          submit={t("cobrar.addSubmit")}
          fields={[
            { key: "concept", label: t("concept"), required: true, placeholder: t("cobrar.conceptPlaceholder") },
            { key: "payer", label: t("cobrar.payer") },
            { key: "amount", label: t("amount"), kind: "number", min: 0 },
            { key: "category", label: t("category"), kind: "select", options: CHARGE_CATEGORIES.map((c) => ({ value: c, label: t(`cobrar.categories.${c}`) })) },
          ]}
          onAdd={add}
        />
        <div className="grid items-start gap-3 sm:grid-cols-2">
          <PickField label={t("show")} value={show} onChange={setShow} options={SHOWS.map((s) => ({ value: s, label: t(`shows.${s}`) }))} />
          <TextField label={t("search")} value={q} onChange={setQ} />
        </div>
        {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
        <ul className="grid gap-2">
          {shown.map((x) => (
            <li key={x.id}>
              <ReceivableRow t={t} x={x} who={nameOf(x)} status={st(x)} today={today} open={openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={t("cobrar.serviceTitle")} className="grid gap-2">
        <h2 className="text-base font-medium text-foreground">{t("cobrar.serviceTitle")}</h2>
        <p className="text-xs text-zinc-400">{t("cobrar.serviceHint")}</p>
        {!byClient.length && <p className="text-sm text-zinc-400">{t("cobrar.serviceNone")}</p>}
        <ul className="grid gap-2">
          {byClient.map((c) => (
            <li key={c.id}>
              <a href={`/interno/admin/clientes?c=${c.id}`} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 p-3 hover:bg-white/[0.03]">
                <span className="text-sm text-zinc-100">{c.name}</span>
                <span className="font-mono text-xs text-zinc-400">
                  {t("cobrar.serviceLine", { amount: mxn(c.amount), n: c.months, since: c.oldest })}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function ReceivableRow({ t, x, who, status, today, open, onToggle }: { t: T; x: Receivable; who: string; status: FinStatus; today: string; open: boolean; onToggle: () => void }) {
  const up = (p: Partial<Receivable>) => receivablesStore.save({ ...x, ...p, updatedAt: new Date().toISOString() })
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{x.concept || t("noConcept")}</span>
          <span className="font-mono text-xs text-zinc-400">{[who, x.dueDate ? t("dueOn", { date: x.dueDate }) : t("noDue"), t(`cobrar.categories.${x.category}`)].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="grid shrink-0 justify-items-end gap-1">
          <span className="font-mono text-sm text-zinc-100">{mxn(balanceOf(x))}</span>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_TONE[status]}`}>{t(`statuses.${status}`)}</span>
        </span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-white/10 p-3">
          <ClientPick label={t("cobrar.client")} searchLabel={t("cobrar.clientSearch")} searchHint={t("cobrar.clientHint")} noneLabel={t("cobrar.noClient")} value={x.clientId} onChange={(clientId) => up({ clientId })} />
          <div className={GRID}>
            {!x.clientId && <TextField label={t("cobrar.payer")} value={x.payer} onChange={(payer) => up({ payer: payer.slice(0, 200) })} />}
            <TextField label={t("concept")} value={x.concept} onChange={(concept) => up({ concept: concept.slice(0, 300) })} />
            <PickField label={t("category")} value={x.category} onChange={(category) => up({ category })} options={CHARGE_CATEGORIES.map((c) => ({ value: c, label: t(`cobrar.categories.${c}`) }))} />
            <NumberField label={t("amount")} unit="MXN" optional max={1e9} precision={2} value={x.amount || null} onChange={(v) => up({ amount: v ?? 0 })} hint={t("ivaHint")} />
            <DateField label={t("issueDate")} value={x.issueDate} onChange={(issueDate) => up({ issueDate })} />
            <DateField label={t("dueDate")} value={x.dueDate} onChange={(dueDate) => up({ dueDate })} />
          </div>
          <PaymentsEditor t={t} doc={x} onChange={(payments) => up({ payments })} />
          <CfdiEditor t={t} doc={x} side="cobrar" today={today} onChange={(cfdi) => up({ cfdi })} />
          <AreaField label={t("notes")} value={x.notes} onChange={(notes) => up({ notes })} rows={2} />
          <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={x.cancelled} onChange={(e) => up({ cancelled: e.target.checked })} className="size-5 accent-white" />
            {t("cancelled")}
          </label>
          <RecordHistory kind="porcobrar" id={x.id} />
          <button type="button" onClick={() => window.confirm(t("confirmRemove")) && receivablesStore.remove(x.id)} className={DANGER}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}
