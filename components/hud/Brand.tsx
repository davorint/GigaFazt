import { useTranslations } from "next-intl"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { PlaceholderChip } from "./PlaceholderChip"
import { BrandLogo } from "./BrandLogo"
import { SmartLink } from "./SmartLink"

/**
 * The GigaFazt logo linking home (`#hero` on the home page, the locale
 * root elsewhere). Shows a placeholder chip until COMPANY_NAME is set. The
 * "home" text is screen-reader only so the accessible name still contains the
 * visible wordmark (WCAG 2.5.3).
 */
export function Brand({ href = "#hero" }: { href?: string }) {
  const t = useTranslations("nav")
  return (
    <SmartLink
      href={href}
      className="flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {isPlaceholder(company.name) ? (
        <PlaceholderChip keyName={company.name.key} />
      ) : (
        <BrandLogo alt={company.name} height={30} className="-my-1 -ml-1.5" />
      )}
      <span className="sr-only">{t("home")}</span>
    </SmartLink>
  )
}
