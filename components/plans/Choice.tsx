"use client"

import { cn } from "cn"

/** Native radio/checkbox styled as a selectable row (keyboard-native). */
export function Choice({
  type,
  name,
  checked,
  onChange,
  label,
}: {
  type: "radio" | "checkbox"
  name: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked ? "border-fiber bg-fiber/10" : "border-border hover:border-foreground/20"
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--color-fiber)]"
      />
      {label}
    </label>
  )
}
