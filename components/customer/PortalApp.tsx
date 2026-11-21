"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
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
  useEffect(() => {
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
  const back = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pago") : null
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
            <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200">
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
