"use client"

import { useId, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Textarea } from "@/components/ui/textarea"
import { SelectField } from "@/components/mikrotik/SelectField"

/** Multi-line text with a mono label (notes, rules), sized for a phone. */
export function AreaField({ label, value, onChange, hint, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; hint?: string; rows?: number }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} aria-describedby={hint ? `${id}-hint` : undefined} className="bg-white/[0.03] text-base md:text-sm" />
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}

/** A choice from a fixed list as a native select (best on phones); `labels` maps each value ("" = none). */
export function PickField<T extends string>({ label, value, onChange, options, hint }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; hint?: string }) {
  return (
    <SelectField label={label} value={value} onChange={(v) => onChange(v as T)} hint={hint}>
      {options.map((o) => (
        <option key={o.value || "none"} value={o.value}>
          {o.label}
        </option>
      ))}
    </SelectField>
  )
}

/** Yes / no / no data. */
export function TriField({ label, value, onChange, hint }: { label: string; value: "si" | "no" | ""; onChange: (v: "si" | "no" | "") => void; hint?: string }) {
  const t = useTranslations("levantamientos.editor")
  return (
    <PickField
      label={label}
      value={value}
      onChange={onChange}
      hint={hint}
      options={[
        { value: "", label: t("unknown") },
        { value: "si", label: t("yes") },
        { value: "no", label: t("no") },
      ]}
    />
  )
}

/** Yes / no / pending / no data (approvals). */
export function ApprovalField({ label, value, onChange }: { label: string; value: "si" | "no" | "pendiente" | ""; onChange: (v: "si" | "no" | "pendiente" | "") => void }) {
  const t = useTranslations("levantamientos.editor")
  return (
    <PickField
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: t("unknown") },
        { value: "si", label: t("yes") },
        { value: "no", label: t("no") },
        { value: "pendiente", label: t("pendingApproval") },
      ]}
    />
  )
}

/** Date input with a mono label. */
export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <input id={id} type="date" value={value} onChange={(e) => onChange(e.target.value)} className="h-10 rounded-md border border-input bg-white/[0.03] px-2.5 font-mono text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm [color-scheme:dark]" />
    </div>
  )
}

/** One item of a list (contact, route, area…) with its title and a remove button. */
export function ItemCard({ title, onRemove, removeLabel, children }: { title: string; onRemove: () => void; removeLabel: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id} className="grid gap-4 rounded-xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <p id={id} className="text-sm font-medium text-foreground">
          {title}
        </p>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${removeLabel}: ${title}`}
          className="min-h-9 rounded-full border border-white/15 px-3 text-xs text-zinc-300 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {removeLabel}
        </button>
      </div>
      {children}
    </div>
  )
}

export function AddButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-11 w-full rounded-xl border border-dashed border-white/20 text-sm text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50 sm:w-fit sm:px-5"
    >
      + {children}
    </button>
  )
}

/** Two columns from tablets up, one on phones. */
export const GRID = "grid items-start gap-4 sm:grid-cols-2"
