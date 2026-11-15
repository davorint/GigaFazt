"use client"

import { useId } from "react"
import { Input } from "@/components/ui/input"

/** Plain text input with a mono label (names, targets, marks). */
export function TextField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = useId()
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="font-mono text-xs text-zinc-300">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="h-10 bg-white/[0.03] font-mono text-base md:text-sm"
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs leading-snug text-zinc-400">
          {hint}
        </p>
      )}
    </div>
  )
}
