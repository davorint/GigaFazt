"use client"

import { useId, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { cn } from "cn"

type Props = {
  label: ReactNode
  /** null = empty (only when `optional`). */
  value: number | null
  onChange: (value: number | null) => void
  unit: string
  hint?: ReactNode
  min?: number
  max?: number
  /** Whole numbers only (burst-time). */
  integer?: boolean
  optional?: boolean
  /** Decimals shown (default 3; coordinates need 6). */
  precision?: number
  className?: string
}

const parse = (text: string) => Number(text.replace(/,/g, "").trim())
const show = (v: number | null, precision = 3) => (v === null ? "" : String(Math.round(v * 10 ** precision) / 10 ** precision))

/**
 * Numeric input that keeps what the user is typing (so "1." or "" don't jump)
 * and only reports valid values. External changes (a preset) replace the text.
 */
export function NumberField({ label, value, onChange, unit, hint, min = 0, max = 1e6, integer, optional, precision = 3, className }: Props) {
  const t = useTranslations("mikrotik.params")
  const id = useId()
  const [text, setText] = useState(show(value, precision))
  const [invalid, setInvalid] = useState(false)
  const [prev, setPrev] = useState(value)

  // Adopt values set from outside (a preset, the solver) unless they match
  // what's typed. Adjusting state during render, as React recommends.
  if (value !== prev) {
    setPrev(value)
    const typed = text.trim() === "" ? null : parse(text)
    if (typed !== value) {
      setText(show(value, precision))
      setInvalid(false)
    }
  }

  const commit = (raw: string) => {
    setText(raw)
    if (raw.trim() === "") {
      setInvalid(!optional)
      if (optional) onChange(null)
      return
    }
    const n = parse(raw)
    const ok = Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n))
    setInvalid(!ok)
    if (ok) onChange(n)
  }

  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          inputMode={integer ? "numeric" : "decimal"}
          autoComplete="off"
          spellCheck={false}
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={hint || invalid ? `${id}-hint` : undefined}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => {
            if (invalid) return
            setText(show(value, precision))
          }}
          className="h-10 bg-white/[0.03] pr-14 font-mono text-base tabular-nums md:text-sm"
        />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-mono text-xs text-zinc-400">
          {unit}
        </span>
      </div>
      {(hint || invalid) && (
        <p id={`${id}-hint`} className={cn("text-xs leading-snug", invalid ? "text-red-300" : "text-zinc-400")}>
          {invalid ? t("invalid") : hint}
        </p>
      )}
    </div>
  )
}
