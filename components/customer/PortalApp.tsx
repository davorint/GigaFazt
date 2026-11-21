"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { speedLabel } from "@/lib/format"
import { simplePdf } from "@/lib/pdf/simple"
import { plans } from "@/lib/plans"
import { OXXO_DAYS } from "@/lib/wispdavor/online"
import type { PortalView } from "@/lib/wispdavor/portal-server"

type State = { kind: "loading" } | { kind: "error"; code: "noToken" | "nomatch" | "busy" | "error" } | { kind: "ok"; view: PortalView }

const CARD = "grid content-start gap-3 rounded-2xl border border-white/10 p-5"
const H2 = "text-xl font-normal tracking-tight text-foreground"

/**
 * Paying online (WispDavor phase 2, Stripe): card, OXXO or SPEI on Stripe's secure page for the amount the server
 * computes; the card can be saved for auto-pay (day 1), which the client can turn off here.
 */
function OnlinePay({ online, money, ahead }: { online: NonNullable<PortalView["online"]>; money: (n: number) => string; ahead: boolean }) {
  const t = useTranslations("portal.online")
  const [state, setState] = useState<"idle" | "going" | "error" | "off">("idle")
  const [save, setSave] = useState(false)
  const go = async (kind: "card" | "oxxo" | "spei") => {
    setState("going")
    try {
      const r = await fetch("/api/mi-cuenta/pagar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tokenFromHash(), kind, saveCard: kind === "card" && save }) })
      const b = (await r.json().catch(() => ({}))) as { url?: string }
      if (!r.ok || !b.url) throw new Error(String(r.status))
      window.location.assign(b.url)
    } catch {
      setState("error")
    }
  }
  const stop = async () => {
    if (!window.confirm(t("autopayConfirm"))) return
    try {
      const r = await fetch("/api/mi-cuenta/domiciliacion", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tokenFromHash() }) })
      setState(r.ok ? "off" : "error")
    } catch {
      setState("error")
    }
  }
  const BTN = "inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm text-foreground hover:bg-white/5 disabled:opacity-50"
  return (
    <section aria-labelledby="pt-online" className={CARD}>
      <h2 id="pt-online" className={H2}>
        {t("title")}
      </h2>
      {online.amount <= 0 ? (
        <p className="text-sm text-muted-foreground">{t("nothing")}</p>
      ) : (
        <>
          {/* Nothing owed: the payment is next month's, ahead of time (lib/wispdavor/online.ts amountToCharge). */}
          <p className="text-foreground">{ahead ? t("ahead", { amount: money(online.amount) }) : t("amount", { amount: money(online.amount) })}</p>
          <div className="flex flex-wrap gap-2">
            {online.methods.map((m) => (
              <button key={m} type="button" disabled={state === "going"} onClick={() => go(m as "card" | "oxxo" | "spei")} className={BTN}>
                {t(m)}
              </button>
            ))}
          </div>
          {online.methods.includes("card") && !online.autopay.active && (
            <label className="flex min-h-10 items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="size-5 accent-white" />
              {t("save")}
            </label>
          )}
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {online.methods.includes("oxxo") && <li>{t("oxxoHint", { days: OXXO_DAYS })}</li>}
            <li>{t("speiHint")}</li>
            <li>{t("secure")}</li>
          </ul>
        </>
      )}
      {online.autopay.active && state !== "off" && (
        <div className="grid gap-2">
          <p className="text-sm text-emerald-100">{t("autopayOn", { brand: online.autopay.brand.toUpperCase(), last4: online.autopay.last4 })}</p>
          <button type="button" onClick={stop} className={`${BTN} w-fit`}>
            {t("autopayOff")}
          </button>
        </div>
      )}
      {state === "off" && <p role="status" className="text-sm text-foreground">{t("autopayDone")}</p>}
      {state === "going" && <p role="status" className="text-sm text-muted-foreground">{t("going")}</p>}
      {state === "error" && <p role="alert" className="text-sm text-amber-100">{t("error")}</p>}
    </section>
  )
}

/** The token from the address's #fragment (never sent to the server in the address, logs or referrers). */
/**
 * "Cambiar de plan" (owner, 2026-11-21): the lineup with the client's current plan marked; asking for another sends a
 * request to the team (Reportes), applied from the next month. Nothing changes by itself.
 */
function PlanChange({ current, money }: { current: string; money: (n: number) => string }) {
  const t = useTranslations("portal.plan")
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState(false)
  // Clientes names plans like the router profiles ("200M", "1G"): the same speed is the same plan.
  const mbps = Number(/\d+/.exec(current)?.[0] ?? 0) * (/g/i.test(current) ? 1000 : 1)
  const ask = async (id: string, label: string) => {
    if (!window.confirm(t("confirm", { plan: label }))) return
    setBusy(true)
    setMsg("")
    try {
      const r = await fetch("/api/mi-cuenta/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: tokenFromHash(), plan: id }) })
      const b = (await r.json().catch(() => ({}))) as { kind?: string; code?: string; error?: string }
      setMsg(r.ok ? t(b.kind === "duplicate" ? "duplicate" : "sent", { code: b.code ?? "" }) : t(r.status === 429 ? "busy" : "error"))
    } catch {
      setMsg(t("error"))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section aria-labelledby="pt-plan" className={CARD}>
      <h2 id="pt-plan" className={H2}>
        {t("title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("lead")}</p>
      <ul className="grid gap-2 sm:grid-cols-3">
        {plans.map((p) => {
          const label = speedLabel(p.downMbps)
          const mine = p.downMbps === mbps
          return (
            <li key={p.id} className={`grid gap-2 rounded-xl border p-3 ${mine ? "border-white/40" : "border-white/10"}`}>
              <span className="text-base text-foreground">{label}</span>
              {typeof p.priceMxn === "number" && <span className="font-mono text-sm text-muted-foreground">{t("price", { amount: money(p.priceMxn) })}</span>}
              {mine ? (
                <span className="text-xs text-emerald-300">{t("current")}</span>
              ) : (
                <button type="button" disabled={busy} onClick={() => void ask(p.id, label)} className="inline-flex min-h-10 w-fit items-center rounded-full border border-white/15 px-4 text-sm text-foreground hover:bg-white/5 disabled:opacity-50">
                  {t("ask")}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {msg && (
        <p role="status" className="text-sm text-foreground">
          {msg}
        </p>
      )}
    </section>
  )
}

const tokenFromHash = () => decodeURIComponent(window.location.hash.replace(/^#/, "").replace(/^k=/, "")).trim()

/**
 * The client portal (/mi-cuenta#<token>, WispDavor → Portal): balance and what's due, services, payments with a
 * printable receipt, reports and how to report a fault; `pay` is the "how to pay" block (server-rendered, the same as
 * /clientes).
 */
export function PortalApp({ pay }: { pay: ReactNode }) {
  const t = useTranslations("portal")
  const ts = useTranslations("customer.status")
  const locale = useLocale()
  const [state, setState] = useState<State>({ kind: "loading" })
  const [receipt, setReceipt] = useState<PortalView["payments"][number] | null>(null)
  const [back, setBack] = useState<string | null>(null)
  useEffect(() => {
    // Back from Stripe (?pago=ok|cancelado): the message shows once; the address keeps only the #token.
    const q = new URLSearchParams(window.location.search).get("pago")
    if (q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the address once when the page opens
      setBack(q)
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`)
    }
    const token = tokenFromHash()
    void (async () => {
      if (!token) return setState({ kind: "error", code: "noToken" })
      try {
        const r = await fetch("/api/mi-cuenta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })
        const b = (await r.json().catch(() => ({}))) as { view?: PortalView }
        if (r.ok && b.view) setState({ kind: "ok", view: b.view })
        else setState({ kind: "error", code: r.status === 404 ? "nomatch" : r.status === 429 ? "busy" : "error" })
      } catch {
        setState({ kind: "error", code: "error" })
      }
    })()
  }, [])
  const money = (n: number) => n.toLocaleString(locale === "en" ? "en-US" : "es-MX", { style: "currency", currency: "MXN" })
  const day = (d: string) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "es-MX", { day: "numeric", month: "long", year: "numeric" }) : "—")
  const month = (m: string) => (m ? new Date(`${m}-15T12:00:00`).toLocaleDateString(locale === "en" ? "en-US" : "es-MX", { month: "long", year: "numeric" }) : "—")

  if (state.kind === "loading") return <p className="text-muted-foreground">{t("loading")}</p>
  if (state.kind === "error") return <p role="alert" className="rounded-xl border border-amber-400/30 p-4 text-amber-100">{t(state.code)}</p>
  const v = state.view
  const b = v.balance
  const tone = b.status === "atrasado" ? "border-red-400/40" : b.status === "por-vencer" ? "border-amber-300/40" : "border-emerald-400/30"
  return (
    <div className="grid gap-6">
      <div className={`grid gap-6 ${receipt ? "print:hidden" : ""}`}>
        <div className="grid gap-1">
          <h1 className="text-4xl font-normal tracking-tight text-foreground sm:text-5xl">{t("hello", { name: v.firstName })}</h1>
          <p className="text-muted-foreground">{v.place}</p>
          <p className="text-xs text-muted-foreground">{t("private")}</p>
        </div>
        {(back === "ok" || back === "cancelado") && (
          <p role="status" className={`rounded-xl border p-4 text-sm ${back === "ok" ? "border-emerald-400/30 text-emerald-100" : "border-white/15 text-foreground"}`}>
            {t(`online.back.${back}`)}
          </p>
        )}
        {v.outage && (
          <p role="status" className="rounded-xl border border-amber-400/40 p-4 text-sm text-amber-100">
            {t("outage", { since: new Date(v.outage.since).toLocaleString(locale === "en" ? "en-US" : "es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) })}
          </p>
        )}
        <section aria-labelledby="pt-balance" className={`${CARD} ${tone}`}>
          <h2 id="pt-balance" className={H2}>
            {t("balanceTitle")}
          </h2>
          <p className="text-lg text-foreground">{t(`status.${b.status}`)}</p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">{t("owed")}</dt>
              <dd className="font-mono text-lg text-foreground">{money(b.owed)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">{t("monthly")}</dt>
              <dd className="font-mono text-foreground">{money(b.monthly)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">{t("nextDue")}</dt>
              <dd className="text-foreground">{day(b.nextDue)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-muted-foreground">{t("coveredUntil")}</dt>
              <dd className="text-foreground">{b.coveredUntil ? month(b.coveredUntil) : "—"}</dd>
            </div>
          </dl>
          {b.lateMonths.length > 0 && <p className="text-sm text-red-200">{`${t("lateMonths")}: ${b.lateMonths.map(month).join(", ")}`}</p>}
        </section>
        {v.online && <OnlinePay online={v.online} money={money} ahead={b.owed <= 0.005} />}
        {pay}
        <section aria-labelledby="pt-services" className={CARD}>
          <h2 id="pt-services" className={H2}>
            {t("servicesTitle")}
          </h2>
          <ul className="grid gap-2">
            {v.services.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="text-foreground">{[t(`serviceTypes.${s.type}`), s.plan].filter(Boolean).join(" · ")}</span>
                <span className="text-muted-foreground">{[s.monthly !== null ? t("perMonth", { amount: money(s.monthly) }) : "", t(`serviceStatus.${s.status}`)].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </section>
        {v.services.some((s) => s.type === "internet" && s.status !== "cancelado") && <PlanChange current={v.services.find((s) => s.type === "internet" && s.status !== "cancelado")?.plan ?? ""} money={money} />}
        <section aria-labelledby="pt-payments" className={CARD}>
          <h2 id="pt-payments" className={H2}>
            {t("paymentsTitle")}
          </h2>
          {!v.payments.length && <p className="text-sm text-muted-foreground">{t("noPayments")}</p>}
          <ul className="grid gap-2">
            {v.payments.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-foreground">
                  {day(p.date)} · <span className="font-mono">{money(p.amount)}</span> · {t(`methods.${p.method}`)}
                </span>
                <button type="button" onClick={() => setReceipt(p)} className="inline-flex min-h-9 items-center rounded-full border border-white/15 px-3 text-xs text-foreground hover:bg-white/5">
                  {t("receipt")}
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="pt-reports" className={CARD}>
          <h2 id="pt-reports" className={H2}>
            {t("reportsTitle")}
          </h2>
          {!v.reports.length && <p className="text-sm text-muted-foreground">{t("noReports")}</p>}
          <ul className="grid gap-2">
            {v.reports.map((r) => (
              <li key={r.code} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-mono text-foreground">{r.code}</span>
                <span className="text-muted-foreground">{[ts(`statuses.${r.status}`), t("reported", { date: day(r.createdAt) })].join(" · ")}</span>
              </li>
            ))}
          </ul>
          <a href={`/${locale}/clientes#reportar`} className="inline-flex min-h-10 w-fit items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200">
            {t("report")}
          </a>
        </section>
      </div>
      {receipt && (
        <section aria-labelledby="pt-receipt" className={`${CARD} print:border-black print:text-black`}>
          <h2 id="pt-receipt" className={H2}>
            {t("receiptTitle")}
          </h2>
          <dl className="grid gap-1 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">GigaFazt ·</dt>
              <dd>{v.place}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">{t("paymentsTitle")}:</dt>
              <dd>
                {day(receipt.date)} · <span className="font-mono">{money(receipt.amount)}</span> · {t(`methods.${receipt.method}`)}
                {receipt.reference ? ` · ${receipt.reference}` : ""}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">{t("receiptNote")}</p>
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={() => {
                // The same receipt as a PDF file (owner, 2026-11-21), made on the phone.
                const pdf = simplePdf(
                  [
                    { text: t("receiptTitle"), size: 20, bold: true },
                    { text: "GigaFazt", size: 12, bold: true, gap: 34 },
                    { text: v.place, size: 11 },
                    { text: `${t("pdf.date")}: ${day(receipt.date)}`, size: 12, gap: 34 },
                    { text: `${t("pdf.amount")}: ${money(receipt.amount)}`, size: 14, bold: true },
                    { text: `${t("pdf.method")}: ${t(`methods.${receipt.method}`)}`, size: 12 },
                    ...(receipt.reference ? [{ text: `${t("pdf.reference")}: ${receipt.reference}`, size: 12 }] : []),
                    { text: t("receiptNote"), size: 10, muted: true, gap: 40 },
                  ],
                  t("receiptTitle")
                )
                const url = URL.createObjectURL(new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }))
                const a = document.createElement("a")
                a.href = url
                a.download = `comprobante-gigafazt-${receipt.date.slice(0, 10)}.pdf`
                document.body.append(a)
                a.click()
                a.remove()
                setTimeout(() => URL.revokeObjectURL(url), 60000)
              }}
              className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
            >
              {t("pdf.download")}
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 text-sm text-foreground hover:bg-white/5">
              {t("print")}
            </button>
            <button type="button" onClick={() => setReceipt(null)} className="inline-flex min-h-10 items-center rounded-full border border-white/15 px-4 text-sm text-foreground hover:bg-white/5">
              {t("close")}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
