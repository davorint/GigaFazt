import { useTranslations } from "next-intl"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { PlaceholderChip } from "./PlaceholderChip"

/**
 * Logo glyph + wordmark linking home (`#hero` on the home page, the locale
 * root elsewhere). Shows a placeholder chip until COMPANY_NAME is set. The
 * "home" text is screen-reader only so the accessible name still contains the
 * visible wordmark (WCAG 2.5.3).
 */
export function Brand({ href = "#hero" }: { href?: string }) {
  const t = useTranslations("nav")
  return (
    <a
      href={href}
      className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
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
      <span className="sr-only">{t("home")}</span>
    </a>
  )
}
