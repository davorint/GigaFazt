"use client"

import { useId, useState, type FormEvent } from "react"
import { Input } from "@/components/ui/input"
import { useTranslations } from "next-intl"

export type QuickField =
  | { key: string; label: string; kind?: "text" | "tel"; required?: boolean; placeholder?: string }
  | { key: string; label: string; kind: "number"; min?: number; placeholder?: string }
  /** Money: a keypad with the decimal point (the plain number keypad has none on iPhone); read with readAmount. */
  | { key: string; label: string; kind: "money"; placeholder?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[] }

const SELECT =
  "h-10 w-full rounded-md border border-input bg-white/[0.03] px-3 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"

/**
 * The form on top of each internal list to add a record (owner, 2026-11-18: "there are no fields to add the new
 * tool, just the button"): the few fields that identify it, right there; "Agregar" saves it and opens its page for
 * the rest. Values come back as strings (numbers too); the section turns them into its record.
 */
export function QuickAdd({
  title,
  fields,
  submit,
  hint,
  initial = {},
  onAdd,
}: {
  title: string
  fields: QuickField[]
  submit: string
  hint?: string
  /** Starting values (the list's current filters). */
  initial?: Record<string, string>
  onAdd: (values: Record<string, string>) => void
}) {
  const t = useTranslations("sync.quickAdd")
  const id = useId()
  const blank = () => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? (f.kind === "select" ? f.options[0]?.value ?? "" : "")]))
  const [v, setV] = useState<Record<string, string>>(blank)
  const [missing, setMissing] = useState(false)
  const required = fields.filter((f) => (f.kind === undefined || f.kind === "text" || f.kind === "tel") && f.required)
  const send = (e: FormEvent) => {
    e.preventDefault()
    if (required.some((f) => !v[f.key]?.trim())) return setMissing(true)
    setMissing(false)
    onAdd(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x.trim()])))
    setV(blank())
  }
  return (
    <form onSubmit={send} aria-labelledby={`${id}-t`} className="grid gap-3 rounded-xl border border-white/15 bg-white/[0.02] p-4">
      <h2 id={`${id}-t`} className="text-base font-medium text-foreground">
        {title}
      </h2>
      <div className="grid items-end gap-3 sm:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {fields.map((f) => (
          <div key={f.key} className="grid content-start gap-1.5">
            <label htmlFor={`${id}-${f.key}`} className="font-mono text-xs text-zinc-300">
              {f.label}
              {"required" in f && f.required ? " *" : ""}
            </label>
            {f.kind === "select" ? (
              <select id={`${id}-${f.key}`} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} className={SELECT}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value} className="bg-zinc-900">
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id={`${id}-${f.key}`}
                type={f.kind === "number" ? "number" : f.kind === "tel" ? "tel" : "text"}
                inputMode={f.kind === "number" ? "numeric" : f.kind === "tel" ? "tel" : f.kind === "money" ? "decimal" : undefined}
                min={f.kind === "number" ? f.min : undefined}
                value={v[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setV({ ...v, [f.key]: e.target.value })}
                aria-invalid={missing && "required" in f && f.required && !v[f.key]?.trim() ? true : undefined}
                className="h-10 bg-white/[0.03] text-base md:text-sm"
              />
            )}
          </div>
        ))}
        <button
          type="submit"
          className="h-10 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {submit}
        </button>
      </div>
      {missing && (
        <p role="alert" className="text-sm text-amber-200">
          {t("missing", { fields: required.filter((f) => !v[f.key]?.trim()).map((f) => f.label).join(", ") })}
        </p>
      )}
      <p className="text-xs text-zinc-400">{hint ?? t("next")}</p>
    </form>
  )
}

/** An amount as typed ("$2,500.50", "2500,5" with a decimal comma): its number, or 0. */
export function readAmount(v: string): number {
  let t = v.replace(/[\s$]/g, "")
  // A single comma followed by 1–2 digits at the end is a decimal comma; any other comma groups thousands.
  t = /^\d+,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, "")
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}
