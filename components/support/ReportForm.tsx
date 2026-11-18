"use client"

import { useId, useState, type FormEvent } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { REPORT_CATEGORIES } from "@/lib/reports/model"

type Field = "name" | "phone" | "address" | "category" | "description" | "consent"
const FIELD = "h-11 bg-white/[0.03] text-base"

/**
 * A client reports a service problem (/reportar): name, phone, building and apartment, what's wrong, a description,
 * privacy consent and a honeypot. Validated again on the server (lib/report-form.ts); the answer carries the
 * report's code, which shows up in /interno/admin/reportes_clientes.
 */
export function ReportForm() {
  const t = useTranslations("report")
  const locale = useLocale()
  const id = useId()
  const [v, setV] = useState({ name: "", phone: "", address: "", category: "", description: "", consent: false, website: "" })
  const [errors, setErrors] = useState<Field[]>([])
  const [status, setStatus] = useState<"idle" | "sending" | "error" | "busy">("idle")
  const [duplicate, setDuplicate] = useState(false)
  const [code, setCode] = useState("")
  const localHref = (x: string) => (x.startsWith("/") ? `/${locale}${x}` : x)
  const legalValue = (x: Maybe<string>) => (isPlaceholder(x) ? <PlaceholderChip keyName={x.key} /> : <span className="text-foreground">{x}</span>)
  const set = (k: keyof typeof v, value: string | boolean) => {
    setV({ ...v, [k]: value })
    setErrors(errors.filter((e) => e !== k))
  }
  const check = (): Field[] => {
    const out: Field[] = []
    if (v.name.trim().length < 2) out.push("name")
    if (!/^(?:\+?52|04[45])?\d{10}$/.test(v.phone.replace(/[\s\-().]/g, ""))) out.push("phone")
    if (v.address.trim().length < 3) out.push("address")
    if (!v.category) out.push("category")
    if (!v.consent) out.push("consent")
    return out
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const bad = check()
    setErrors(bad)
    if (bad.length) {
      document.getElementById(`${id}-${bad[0]}`)?.focus()
      return
    }
    setStatus("sending")
    try {
      const res = await fetch("/api/reportes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(v) })
      const body = (await res.json().catch(() => ({}))) as { code?: string; fields?: string[]; duplicate?: boolean }
      if (res.status === 422 && body.fields?.length) {
        setErrors(body.fields.filter((f): f is Field => ["name", "phone", "address", "category", "description", "consent"].includes(f)))
        setStatus("idle")
        return
      }
      if (res.status === 429) {
        setStatus("busy")
        return
      }
      if (!res.ok || !body.code) throw new Error(String(res.status))
      setDuplicate(body.duplicate === true)
      setCode(body.code)
    } catch {
      setStatus("error")
    }
  }
  const err = (k: Field) =>
    errors.includes(k) ? (
      <p id={`${id}-${k}-error`} className="text-sm text-destructive">
        {t(`errors.${k}`)}
      </p>
    ) : null
  const aria = (k: Field) => ({ id: `${id}-${k}`, "aria-invalid": errors.includes(k) || undefined, "aria-describedby": errors.includes(k) ? `${id}-${k}-error` : undefined })
  const wa = isPlaceholder(company.whatsapp) ? null : whatsappHref(company.whatsapp as string, t("waText"))

  if (code) {
    return (
      <div role="status" className="grid justify-items-start gap-3 rounded-2xl border border-emerald-400/30 p-6">
        <CheckCircle2 aria-hidden className="size-8 text-emerald-300" />
        <p className="text-xl text-foreground">{t(duplicate ? "sentDuplicate" : "sent", { code })}</p>
        <p className="text-sm text-muted-foreground">{t(duplicate ? "sentDuplicateHint" : "sentHint")}</p>
      </div>
    )
  }
  return (
    <form onSubmit={submit} noValidate className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-name`} className="text-sm font-medium">
            {t("name")}
          </label>
          <Input {...aria("name")} autoComplete="name" value={v.name} onChange={(e) => set("name", e.target.value)} className={FIELD} />
          {err("name")}
        </div>
        <div className="grid gap-1.5">
          <label htmlFor={`${id}-phone`} className="text-sm font-medium">
            {t("phone")}
          </label>
          <Input {...aria("phone")} type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} className={FIELD} />
          {err("phone")}
        </div>
      </div>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-address`} className="text-sm font-medium">
          {t("address")}
        </label>
        <Input {...aria("address")} autoComplete="street-address" value={v.address} onChange={(e) => set("address", e.target.value)} className={FIELD} />
        <p className="text-xs text-muted-foreground">{t("addressHint")}</p>
        {err("address")}
      </div>
      <fieldset className="grid gap-2" aria-describedby={errors.includes("category") ? `${id}-category-error` : undefined}>
        <legend className="mb-1 text-sm font-medium">{t("category")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REPORT_CATEGORIES.map((c, i) => (
            <label key={c} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 text-sm has-[:checked]:border-white/40 has-[:checked]:bg-white/[0.05]">
              <input type="radio" name="category" value={c} id={i === 0 ? `${id}-category` : undefined} checked={v.category === c} onChange={() => set("category", c)} className="size-4 accent-white" />
              {t(`categories.${c}`)}
            </label>
          ))}
        </div>
        {err("category")}
      </fieldset>
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-description`} className="text-sm font-medium">
          {t("description")}
        </label>
        <Textarea {...aria("description")} rows={4} maxLength={1000} value={v.description} onChange={(e) => set("description", e.target.value)} className="bg-white/[0.03] text-base" />
        <p className="text-xs text-muted-foreground">{t("descriptionHint")}</p>
        {err("description")}
      </div>

      {/* Honeypot: off-screen, not focusable, ignored by humans. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          {t("honeypot")}
          <input tabIndex={-1} autoComplete="off" value={v.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>

      {/* LFPDPPP art. 16-II: data collected online needs the simplified notice plus a link to the full one. */}
      <p className="rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-muted-foreground">
        {t.rich("simplified", {
          name: company.name as string,
          entity: () => legalValue(company.legal.entityName),
          address: () => legalValue(company.legal.address),
        })}{" "}
        {!isPlaceholder(company.legal.privacyUrl) && (
          <a href={localHref(company.legal.privacyUrl as string)} target="_blank" rel="noopener noreferrer" className="text-fiber underline underline-offset-4">
            {t("readFull")}
          </a>
        )}
      </p>
      <div className="grid gap-1.5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" {...aria("consent")} checked={v.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-0.5 size-5 accent-white" />
          <span>{t("consent")}</span>
        </label>
        {err("consent")}
      </div>
      {(status === "error" || status === "busy") && (
        <p role="alert" className="text-sm text-destructive">
          {t(status === "busy" ? "busy" : "error")}{" "}
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {t("errorWhatsapp")}
            </a>
          )}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" disabled={status === "sending"}>
          {status === "sending" && <Loader2 aria-hidden className="animate-spin" />}
          {status === "sending" ? t("sending") : t("submit")}
        </Button>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            {t("orWhatsapp")}
          </a>
        )}
      </div>
    </form>
  )
}
