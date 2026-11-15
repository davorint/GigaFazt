"use client"

import { useId, type ReactNode } from "react"

const SELECT =
  "h-10 w-full rounded-md border border-input bg-zinc-950 px-2.5 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"

type Props = { label: string; value: string; onChange: (v: string) => void; hint?: string; className?: string; children: ReactNode }

/** Native select with a mono label (works with every keyboard and screen reader). */
export function SelectField({ label, value, onChange, hint, className, children }: Props) {
  const id = useId()
  return (
    <div className={`grid content-start gap-1.5 ${className ?? ""}`}>
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} className={SELECT}>
        {children}
      </select>
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}
