"use client"

import { useId, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { localToday } from "@/lib/clients/from-lead"
import { clientLabel, type Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { whatsappHref } from "@/lib/contact"
import { mxn } from "@/lib/materials/catalog"
import { GRACE_DAYS, PAYMENT_METHODS, collectionStats, ledger, monthlyDue, morososLines, newPayment, paymentsCsv, type Ledger, type Payment, type PaymentMethod, type PayStatus } from "@/lib/payments/model"
import { paymentsStore } from "@/lib/payments/store"
import { siteLabel } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { readState } from "@/lib/sync/state"

type T = ReturnType<typeof useTranslations>
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const DANGER = "inline-flex min-h-9 w-fit items-center rounded-full border border-red-400/30 px-3 text-xs text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "h-11 w-fit rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const TONE: Record<PayStatus, string> = {
  atrasado: "border-red-400/40 text-red-200",
  "por-vencer": "border-amber-400/40 text-amber-200",
  "al-corriente": "border-emerald-400/30 text-emerald-200",
  "sin-cobro": "border-white/15 text-zinc-400",
}
const RANK: Record<PayStatus, number> = { atrasado: 0, "por-vencer": 1, "al-corriente": 2, "sin-cobro": 3 }
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/** "noviembre 2026" from "2026-11". */
export function monthName(m: string) {
  if (!m) return ""
  const [y, mo] = m.split("-").map(Number)
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** One line about where the client stands: owed, months late, covered until. */
export function ledgerLine(t: T, l: Ledger) {
  if (l.status === "sin-cobro") return t("pay.noCharge")
  const parts = [t("pay.monthly", { amount: mxn(l.monthly) })]
  if (l.owed > 0) parts.push(t("pay.owed", { amount: mxn(l.owed) }))
  if (l.lateMonths.length) parts.push(t("pay.lateMonths", { n: l.lateMonths.length }))
  parts.push(l.coveredUntil ? t("pay.covered", { month: monthName(l.coveredUntil) }) : t("pay.notCovered", { month: monthName(l.start) }))
  return parts.join(" · ")
}

/** Records a payment for one client: amount (what it owes, or a month), date, method, reference. */
export function PaymentForm({ t, client, l, onDone }: { t: T; client: Client; l: Ledger; onDone: (msg: string) => void }) {
  const [amount, setAmount] = useState<number | null>(l.owed > 0 ? Math.round(l.owed * 100) / 100 : l.monthly || null)
  const [date, setDate] = useState(localToday())
  const [method, setMethod] = useState<PaymentMethod>(PAYMENT_METHODS.includes(client.payMethod as PaymentMethod) ? (client.payMethod as PaymentMethod) : "efectivo")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")
  const save = () => {
    if (!amount || amount <= 0) return setError(t("pay.form.needAmount"))
    if (!date) return setError(t("pay.form.needDate"))
    const p = newPayment({ clientId: client.id, amount, date, method, reference: reference.trim(), notes: notes.trim(), by: readState().name })
    paymentsStore.save(p)
    const after = ledger(client, [...paymentsStore.list()], localToday())
    onDone(t("pay.form.saved", { amount: mxn(amount), name: clientLabel(client), covered: after.coveredUntil ? monthName(after.coveredUntil) : "—" }))
  }
  return (
    <div role="group" aria-label={t("pay.form.title", { name: clientLabel(client) })} className="grid gap-4 rounded-xl border border-white/15 p-4">
      <p className="text-sm font-medium text-foreground">{t("pay.form.title", { name: clientLabel(client) })}</p>
      <div className={GRID}>
        <NumberField label={t("pay.form.amount")} unit="MXN" optional precision={2} max={1e7} value={amount} onChange={setAmount} />
        <DateField label={t("pay.form.date")} value={date} onChange={setDate} />
        <PickField label={t("pay.form.method")} value={method} onChange={setMethod} options={PAYMENT_METHODS.map((m) => ({ value: m, label: t(`pay.methods.${m}`) }))} />
        <TextField label={t("pay.form.reference")} value={reference} onChange={setReference} />
      </div>
      <TextField label={t("pay.form.notes")} value={notes} onChange={setNotes} />
      {error && (
        <p role="alert" className="text-sm text-red-200">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} className={PRIMARY}>
          {t("pay.form.save")}
        </button>
        <button type="button" onClick={() => onDone("")} className={SMALL}>
          {t("pay.form.cancel")}
        </button>
      </div>
    </div>
  )
}

/** The client's WhatsApp (or phone) as wa.me digits: 10 digits get Mexico's 52. "" without one. */
const waDigits = (c: Client | undefined) => {
  const d = (c?.whatsapp || c?.phone || "").replace(/\D/g, "")
  return d.length === 10 ? `52${d}` : d
}

/** The receipt of a payment as text (WhatsApp or copied): folio, client, date, amount with IVA, method, reference, where the client stands now. */
export function receiptText(t: T, p: Payment, c: Client | undefined, l: Ledger | null) {
  return [
    t("pay.receipt.title"),
    t("pay.receipt.folio", { folio: p.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() }),
    c && t("pay.receipt.client", { name: clientLabel(c) }),
    t("pay.receipt.date", { date: p.date }),
    t("pay.receipt.amount", { amount: mxn(p.amount) }),
    t("pay.receipt.method", { method: t(`pay.methods.${p.method}`) }),
    p.reference && t("pay.receipt.reference", { ref: p.reference }),
    l?.coveredUntil && t("pay.receipt.covered", { month: monthName(l.coveredUntil) }),
    l && l.owed > 0 && t("pay.receipt.owed", { amount: mxn(l.owed) }),
    t("pay.receipt.thanks"),
  ]
    .filter(Boolean)
    .join("\n")
}

/** The payments of one client, newest first, each removable. */
function PaymentList({ t, clientId, limit = 12 }: { t: T; clientId?: string; limit?: number }) {
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot).list
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot).list
  const [copied, setCopied] = useState("")
  const mine = payments.filter((p) => !clientId || p.clientId === clientId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  if (!mine.length) return <p className="text-sm text-zinc-400">{t("pay.history.none")}</p>
  return (
    <ul className="grid gap-2">
      {mine.slice(0, limit).map((p) => {
        const c = clients.find((x) => x.id === p.clientId)
        return (
          <li key={p.id} className="grid gap-1 rounded-lg border border-white/10 p-3 text-sm">
            <span className="flex flex-wrap justify-between gap-2">
              <span className="text-zinc-100">
                {mxn(p.amount)} · {t(`pay.methods.${p.method}`)}
                {!clientId && ` · ${c ? clientLabel(c) : t("pay.history.unknownClient")}`}
              </span>
              <span className="font-mono text-xs text-zinc-400">{p.date}</span>
            </span>
            {(p.reference || p.notes || p.by) && <span className="text-xs text-zinc-300">{[p.reference && t("pay.history.ref", { ref: p.reference }), p.notes, p.by && t("pay.history.by", { by: p.by })].filter(Boolean).join(" · ")}</span>}
            <span className="flex flex-wrap gap-2">
              {(() => {
                const text = () => receiptText(t, p, c, c ? ledger(c, payments, localToday()) : null)
                const wa = waDigits(c)
                return (
                  <>
                    {wa && (
                      <a href={whatsappHref(wa, text())} target="_blank" rel="noopener noreferrer" className={SMALL}>
                        {t("pay.history.receiptWa")}
                      </a>
                    )}
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(text()).then(() => setCopied(p.id)).catch(() => undefined)} className={SMALL}>
                      {copied === p.id ? t("pay.history.receiptCopied") : t("pay.history.receiptCopy")}
                    </button>
                  </>
                )
              })()}
              <button type="button" onClick={() => window.confirm(t("pay.history.confirmRemove", { amount: mxn(p.amount), date: p.date })) && paymentsStore.remove(p.id)} className={DANGER}>
                {t("pay.history.remove")}
              </button>
            </span>
          </li>
        )
      })}
      {mine.length > limit && <li className="text-xs text-zinc-400">{t("pay.history.more", { n: mine.length - limit })}</li>}
    </ul>
  )
}

/** Inside a client's page: where it stands, "Cobrar desde", record a payment, its payments. */
export function ClientBilling({ t, c, onChange }: { t: T; c: Client; onChange: (p: Partial<Client>) => void }) {
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot).list
  const [form, setForm] = useState(false)
  const [msg, setMsg] = useState("")
  const id = useId()
  const l = ledger(c, payments, localToday())
  return (
    <div className="grid gap-3">
      <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-100">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[l.status]}`}>{t(`pay.statuses.${l.status}`)}</span>
        {ledgerLine(t, l)}
      </p>
      <div className="grid content-start gap-1.5 sm:max-w-xs">
        <label htmlFor={id} className="font-mono text-xs text-zinc-300">
          {t("pay.from")}
        </label>
        <input
          id={id}
          type="month"
          value={c.billingFrom}
          onChange={(e) => onChange({ billingFrom: e.target.value })}
          className="h-10 rounded-md border border-input bg-white/[0.03] px-2.5 font-mono text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [color-scheme:dark]"
        />
        <p className="text-xs text-zinc-400">{t("pay.fromHint")}</p>
      </div>
      {msg && (
        <p role="status" className="text-sm text-emerald-300">
          {msg}
        </p>
      )}
      {form ? (
        <PaymentForm
          t={t}
          client={c}
          l={l}
          onDone={(m) => {
            setForm(false)
            setMsg(m)
          }}
        />
      ) : (
        <button type="button" onClick={() => (setMsg(""), setForm(true))} className={SMALL}>
          {t("pay.record")}
        </button>
      )}
      <PaymentList t={t} clientId={c.id} limit={6} />
    </div>
  )
}

/** Clientes → Cobranza: this month's totals, who is late, recording payments, and the list for the MikroTik. */
export function PaymentsPanel({ onClient }: { onClient: (id: string) => void }) {
  const t = useTranslations("clientes")
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const payments = useSyncExternalStore(paymentsStore.subscribe, paymentsStore.snapshot, paymentsStore.serverSnapshot).list
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot).list
  const [filter, setFilter] = useState<PayStatus | "" | "cobro">("cobro")
  const [site, setSite] = useState("")
  const [q, setQ] = useState("")
  const [form, setForm] = useState<string | null>(null)
  const [msg, setMsg] = useState("")
  const [copied, setCopied] = useState("")
  if (!clients.loaded) return null
  const today = localToday()
  const list = clients.list
  const st = collectionStats(list, payments, today)
  const rows = list
    .map((c) => ({ c, l: ledger(c, payments, today) }))
    .filter(({ c, l }) => (filter === "" ? true : filter === "cobro" ? l.status !== "sin-cobro" : l.status === filter) && (!site || c.siteId === site))
    .filter(({ c }) => !q.trim() || fold([c.name, c.phone, c.whatsapp, c.building, c.tower, c.apartment, ...c.services.map((s) => s.pppoeUser)].join(" ")).includes(fold(q.trim())))
    .sort((a, b) => RANK[a.l.status] - RANK[b.l.status] || b.l.owed - a.l.owed || clientLabel(a.c).localeCompare(clientLabel(b.c), "es"))
  const unpriced = list.filter((c) => c.services.some((s) => s.status !== "cancelado" && s.monthly === null)).length
  const morosos = morososLines(list, payments, today)
  const copyMorosos = async () => {
    try {
      await navigator.clipboard.writeText(morosos)
      setCopied(t("pay.morosos.copied", { n: morosos.split("\n").length }))
    } catch {
      setCopied(t("pay.morosos.copyFailed"))
    }
  }
  const nameOf = (id: string) => {
    const c = list.find((x) => x.id === id)
    return c ? clientLabel(c) : ""
  }
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("pay.intro", { grace: GRACE_DAYS })}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label={t("pay.tiles.expected")} value={mxn(st.expected)} />
        <Tile label={t("pay.tiles.collected")} value={mxn(st.collected)} sub={t("pay.tiles.payments", { n: st.payments })} />
        <Tile label={t("pay.tiles.late")} value={String(st.late)} sub={st.late ? mxn(st.lateAmount) : undefined} />
        <Tile label={t("pay.tiles.soon")} value={String(st.soon)} />
      </div>
      {unpriced > 0 && <p className="text-sm text-amber-200">{t("pay.unpriced", { n: unpriced })}</p>}
      {msg && (
        <p role="status" className="text-sm text-emerald-300">
          {msg}
        </p>
      )}

      <div className="grid items-start gap-3 sm:grid-cols-3">
        <PickField
          label={t("pay.filter")}
          value={filter}
          onChange={setFilter}
          options={[
            { value: "cobro", label: t("pay.filters.cobro") },
            { value: "atrasado", label: t("pay.statuses.atrasado") },
            { value: "por-vencer", label: t("pay.statuses.por-vencer") },
            { value: "al-corriente", label: t("pay.statuses.al-corriente") },
            { value: "sin-cobro", label: t("pay.statuses.sin-cobro") },
            { value: "", label: t("pay.filters.all") },
          ]}
        />
        <PickField label={t("pay.site")} value={site} onChange={setSite} options={[{ value: "", label: t("pay.allSites") }, ...sites.map((s) => ({ value: s.id, label: siteLabel(s) }))]} />
        <TextField label={t("pay.search")} value={q} onChange={setQ} />
      </div>

      <p className="text-sm text-zinc-400" aria-live="polite">
        {t("pay.count", { n: rows.length })}
      </p>
      <ul className="grid gap-2">
        {rows.slice(0, 300).map(({ c, l }) => {
          const phone = c.whatsapp || c.phone
          return (
            <li key={c.id} className={`grid gap-2 rounded-xl border p-3 ${l.status === "atrasado" ? "border-red-400/30" : "border-white/10"}`}>
              <span className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm text-zinc-100">{clientLabel(c)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[l.status]}`}>{t(`pay.statuses.${l.status}`)}</span>
              </span>
              <span className="text-xs text-zinc-300">
                {ledgerLine(t, l)}
                {c.payDay ? ` · ${t("pay.day", { n: c.payDay })}` : ""}
              </span>
              {form === c.id ? (
                <PaymentForm
                  t={t}
                  client={c}
                  l={l}
                  onDone={(m) => {
                    setForm(null)
                    setMsg(m)
                  }}
                />
              ) : (
                <span className="flex flex-wrap gap-2">
                  {monthlyDue(c) > 0 && (
                    <button type="button" onClick={() => (setMsg(""), setForm(c.id))} className={SMALL}>
                      {t("pay.record")}
                    </button>
                  )}
                  {phone && l.owed > 0 && (
                    <a href={whatsappHref(phone.replace(/\D/g, "").length === 10 ? `52${phone.replace(/\D/g, "")}` : phone.replace(/\D/g, ""), t("pay.waText", { name: c.name.trim() || "", amount: mxn(l.owed) }))} target="_blank" rel="noopener noreferrer" className={SMALL}>
                      {t("pay.remind")}
                    </a>
                  )}
                  <button type="button" onClick={() => onClient(c.id)} className={SMALL}>
                    {t("pay.open")}
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {rows.length > 300 && <p className="text-xs text-zinc-400">{t("pay.more", { n: rows.length - 300 })}</p>}

      <section aria-labelledby="pay-morosos" className="grid gap-2 rounded-xl border border-white/10 p-4">
        <h3 id="pay-morosos" className="text-base font-medium text-foreground">
          {t("pay.morosos.title")}
        </h3>
        <p className="text-sm text-zinc-300">{t("pay.morosos.hint")}</p>
        {morosos ? (
          <>
            <pre className="max-h-48 overflow-auto rounded-md bg-black/30 p-3 font-mono text-xs text-zinc-200">{morosos}</pre>
            <button type="button" onClick={copyMorosos} className={SMALL}>
              {t("pay.morosos.copy")}
            </button>
            {copied && (
              <p role="status" className="text-xs text-zinc-300">
                {copied}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-400">{t("pay.morosos.none")}</p>
        )}
      </section>

      <section aria-labelledby="pay-history" className="grid gap-3">
        <h3 id="pay-history" className="text-lg font-medium text-foreground">
          {t("pay.history.title")}
        </h3>
        <button type="button" onClick={() => download(`pagos-${today}.csv`, paymentsCsv(payments, nameOf, (m) => t(`pay.methods.${m}`)))} disabled={!payments.length} className={SMALL}>
          {t("pay.history.csv")}
        </button>
        <PaymentList t={t} limit={40} />
      </section>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="grid gap-1 rounded-xl border border-white/10 p-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className="font-mono text-lg text-zinc-100">{value}</span>
      {sub && <span className="text-xs text-zinc-400">{sub}</span>}
    </div>
  )
}
