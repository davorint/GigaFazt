"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { DANGER } from "@/components/finance/FinParts"
import { clientLabel } from "@/lib/clients/model"
import { mxn } from "@/lib/materials/catalog"
import { readState } from "@/lib/sync/state"
import { useWispData } from "./useWispData"

type Row = { id: string; client_id: string; kind: string; amount: number; status: string; payment_id: string; error: string; created_at: string; paid_at: string | null }
type Auto = { client_id: string; card_brand: string; card_last4: string }
type Data = { configured: { stripe: boolean; webhook: boolean; cron: boolean; testMode: boolean }; payments: Row[]; autopay: Auto[] }

const TONE: Record<string, string> = { paid: "text-emerald-300", failed: "text-red-300", expired: "text-zinc-400", pending: "text-zinc-300", waiting: "text-amber-200" }

/** /interno/software/wispdavor/pagos: Stripe's state, the online payments and who has card auto-pay. */
export function OnlinePaymentsApp() {
  const t = useTranslations("wispdavor.pagos")
  const d = useWispData()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/pagos-en-linea", { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      setData((await r.json()) as Data)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the payments once from the server when the page opens
    void load()
  }, [load])
  if (!d.loaded) return null
  const name = (id: string) => {
    const c = d.clients.find((x) => x.id === id)
    return c ? clientLabel(c) : id.slice(0, 8)
  }
  const stop = async (clientId: string) => {
    if (!window.confirm(t("confirmStop", { name: name(clientId) }))) return
    const r = await fetch("/api/interno/pagos-en-linea", { method: "POST", headers: { "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) }, body: JSON.stringify({ clientId }) }).catch(() => null)
    if (r?.ok) await load()
    else setError(true)
  }
  const c = data?.configured
  return (
    <div className="mt-6 grid gap-8">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {error && <p className="text-xs text-amber-200">{t("error")}</p>}
      {c && (
        <ul className="flex flex-wrap gap-2 text-xs">
          {(["stripe", "webhook", "cron"] as const).map((k) => (
            <li key={k} className={`rounded-full border px-3 py-1 ${c[k] ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200"}`}>
              {t(`status.${k}`)}: {c[k] ? t("status.on") : t("status.off")}
            </li>
          ))}
          {c.testMode && <li className="rounded-full border border-cyan-400/30 px-3 py-1 text-cyan-200">{t("status.test")}</li>}
        </ul>
      )}
      <section aria-labelledby="wd-pay-list" className="grid gap-2">
        <h2 id="wd-pay-list" className="text-xl font-light text-foreground">
          {t("payments")}
        </h2>
        {data && !data.payments.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
        <ul className="grid gap-1.5">
          {data?.payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <span className="text-zinc-100">
                <a href={`/interno/admin/clientes?c=${p.client_id}`} className="underline decoration-white/20 underline-offset-4 hover:decoration-white">
                  {name(p.client_id)}
                </a>{" "}
                <span className="text-zinc-400">· {t(`kinds.${p.kind}`)}</span>
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {mxn(p.amount)} · <span className={TONE[p.status] ?? ""}>{t.has(`statuses.${p.status}`) ? t(`statuses.${p.status}`) : p.status}</span> · {(p.paid_at ?? p.created_at).slice(0, 10)}
                {p.error ? ` · ${p.error}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="wd-autopay" className="grid gap-2">
        <h2 id="wd-autopay" className="text-xl font-light text-foreground">
          {t("autopay")}
        </h2>
        {data && !data.autopay.length && <p className="text-sm text-zinc-400">{t("autopayNone")}</p>}
        <ul className="grid gap-1.5">
          {data?.autopay.map((a) => (
            <li key={a.client_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <span className="text-zinc-100">
                {name(a.client_id)} <span className="font-mono text-xs text-zinc-400">{t("card", { brand: a.card_brand.toUpperCase(), last4: a.card_last4 })}</span>
              </span>
              <button type="button" onClick={() => stop(a.client_id)} className={DANGER}>
                {t("stop")}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <details className="rounded-2xl border border-white/10 p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("setup.title")}</summary>
        <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
          {(t.raw("setup.steps") as string[]).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
    </div>
  )
}
