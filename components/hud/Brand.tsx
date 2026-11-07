import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { PlaceholderChip } from "./PlaceholderChip"

/** Logo glyph + wordmark. Shows a placeholder chip until COMPANY_NAME is set. */
export function Brand() {
  return (
    <a href="#hero" className="flex items-center gap-2" aria-label="Inicio">
      <span
        aria-hidden
        className="inline-block size-4 rotate-45 rounded-[3px] bg-fiber shadow-[0_0_12px_var(--color-fiber)]"
      />
      {isPlaceholder(company.name) ? (
        <PlaceholderChip keyName={company.name.key} />
      ) : (
        <span className="font-mono text-sm font-medium tracking-tight">
          {company.name}
        </span>
      )}
    </a>
  )
}
