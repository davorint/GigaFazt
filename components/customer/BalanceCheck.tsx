"use client"

import { useId, useState, type FormEvent } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { isPlaceholder } from "@/lib/placeholder"

type Balance = { firstName: string; status: "atrasado" | "por-vencer" | "al-corriente" | "sin-cobro"; monthly: number; owed: number; lateMonths: string[]; coveredUntil: string; nextDue: string }
const TONE: Record<Balance["status"], string> = {
  atrasado: "border-red-400/40",
  "por-vencer": "border-amber-400/40",
  "al-corriente": "border-emerald-400/40",
  "sin-cobro": "border-white/15",
}

/** /clientes → Mi saldo: phone + PPPoE user of the same client (POST /api/clientes/saldo). */
export function BalanceCheck() {
  const t = useTranslations("customer.balance")
  const locale = useLocale()
  const lc = locale === "es" ? "es-MX" : "en-US"
  const id = useId()
  const [phone, setPhone] = useState("")
  const [pppoe, setPppoe] = useState("")
  const [state, setState] = useState<"idle" | "sending" | "invalid" | "nomatch" | "busy" | "error">("idle")
  const [b, setB] = useState<Balance | null>(null)
  const money = (v: number) => v.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
  const month = (m: string) => {
    const [y, mo] = m.split("-").map(Number)
    return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString(lc, { month: "long", year: "numeric", timeZone: "UTC" })
  }
  const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(lc, { dateStyle: "long" })
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setB(null)
    if (phone.replace(/\D/g, "").length < 10 || !pppoe.trim()) return setState("invalid")
    setState("sending")
    try {
      const res = await fetch("/api/clientes/saldo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phone, pppoe }) })
      if (res.status === 422) return setState("invalid")
      if (res.status === 404) return setState("nomatch")
      if (res.status === 429) return setState("busy")
      const body = (await res.json().catch(() => ({}))) as { balance?: Balance }
      if (!res.ok || !body.balance) throw new Error(String(res.status))
      setB(body.balance)
      setState("idle")
    } catch {
      setState("error")
    }
  }
  return (
    <div className="grid gap-5">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-phone`} className="text-sm font-medium">
              {t("phone")}
            </label>
            <Input id={`${id}-phone`} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 bg-white/[0.03] text-base" />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${id}-pppoe`} className="text-sm font-medium">
              {t("pppoe")}
            </label>
            <Input id={`${id}-pppoe`} autoComplete="off" autoCapitalize="none" spellCheck={false} value={pppoe} onChange={(e) => setPppoe(e.target.value)} aria-describedby={`${id}-pppoe-hint`} className="h-11 bg-white/[0.03] text-base" />
            <p id={`${id}-pppoe-hint`} className="text-xs text-muted-foreground">
              {t("pppoeHint")}
            </p>
          </div>
        </div>
        <Button type="submit" size="lg" disabled={state === "sending"} className="w-fit">
          {state === "sending" && <Loader2 aria-hidden className="animate-spin" />}
          {t("submit")}
        </Button>
      </form>
      <div aria-live="polite" className="grid gap-3">
        {state !== "idle" && state !== "sending" && <p className="text-sm text-destructive">{t(state)}</p>}
        {b && (
          <div className={`grid gap-2 rounded-2xl border p-5 ${TONE[b.status]}`}>
            <p className="text-lg text-foreground">{t(`result.${b.status}`, { name: b.firstName })}</p>
            {b.status !== "sin-cobro" && (
              <ul className="grid gap-1 text-sm text-muted-foreground">
                <li>{t("monthly", { amount: money(b.monthly) })}</li>
                {b.owed > 0 && <li className="text-foreground">{t("owed", { amount: money(b.owed) })}</li>}
                {b.lateMonths.length > 0 && <li>{t("lateMonths", { months: b.lateMonths.map(month).join(", ") })}</li>}
                {b.coveredUntil && <li>{t("covered", { month: month(b.coveredUntil) })}</li>}
                {b.nextDue && <li>{t("nextDue", { date: day(b.nextDue) })}</li>}
              </ul>
            )}
            {b.owed > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <a href="#como-pagar" className="text-fiber underline underline-offset-4">
                  {t("payHow", { amount: money(b.owed) })}
                </a>
                {!isPlaceholder(company.whatsapp) && (
                  <a href={whatsappHref(company.whatsapp, t("payWa", { amount: money(b.owed), user: pppoe.trim() }))} target="_blank" rel="noopener noreferrer" className="text-fiber underline underline-offset-4">
                    {t("paySend")}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
