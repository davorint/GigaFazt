"use client"

import type { ReactNode } from "react"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "cn"

type Option<T extends string> = { value: T; label: ReactNode }

/** Single-choice segmented control (ToggleGroup that can't be emptied). */
export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: Option<T>[]
  label: string
  className?: string
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(v) => {
        const next = (v as T[])[0]
        if (next) onChange(next)
      }}
      aria-label={label}
      spacing={0}
      className={cn("flex w-full flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 sm:w-fit", className)}
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className="h-9 flex-auto rounded-lg px-3 text-sm text-zinc-400 data-[pressed]:bg-white/10 data-[pressed]:text-foreground sm:flex-none"
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
