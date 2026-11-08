"use client"

import { Check } from "lucide-react"
import { cn } from "cn"

/**
 * Native radio/checkbox styled as a big tappable tile (keyboard-native: the
 * input stays in the tab order, visually hidden; the tile shows its focus ring).
 */
export function Choice({
  type,
  name,
  checked,
  onChange,
  label,
  icon: Icon,
}: {
  type: "radio" | "checkbox"
  name: string
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <label
      className={cn(
        "group relative flex min-h-20 cursor-pointer flex-col justify-between gap-3 rounded-xl border p-3.5 text-sm transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:p-4",
        checked
          ? "border-fiber/70 bg-fiber/10 text-foreground shadow-[0_0_24px_-10px_var(--color-fiber)]"
          : "border-white/10 bg-white/[0.02] text-muted-foreground hover:border-white/25 hover:text-foreground"
      )}
    >
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span className="flex items-start justify-between gap-2">
        {Icon && <Icon className={cn("size-5 transition-colors", checked ? "text-fiber" : "text-muted-foreground group-hover:text-foreground")} />}
        <span
          aria-hidden
          className={cn(
            "ml-auto grid size-5 shrink-0 place-items-center border transition-colors",
            type === "radio" ? "rounded-full" : "rounded-md",
            checked ? "border-fiber bg-fiber text-background" : "border-white/20"
          )}
        >
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </span>
      <span className={cn("font-medium leading-snug", checked && "text-foreground")}>{label}</span>
    </label>
  )
}
