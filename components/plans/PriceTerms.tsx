import { useLocale, useTranslations } from "next-intl"
import { cn } from "cn"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { formatDate, formatMxn } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import type { Plan } from "@/lib/types"

/**
 * The small mono lines that must sit next to every price (hard rule #5):
 * MXN + IVA, install fee, contract term and promo end date. Placeholders render
 * as visible chips. Hook-only (no state), so it works in server and client trees.
 */
export function PriceTerms({
  plan,
  className,
  inline = false,
}: {
  plan: Pick<Plan, "installFeeMxn" | "contractMonths" | "promo">
  className?: string
  inline?: boolean
}) {
  const t = useTranslations("plans")
  const locale = useLocale()
  const { installFeeMxn: fee, contractMonths: term, promo } = plan

  return (
    <ul
      className={cn(
        "font-mono text-[0.7rem] leading-relaxed text-muted-foreground",
        inline ? "flex flex-wrap items-center gap-x-3 gap-y-1" : "space-y-1",
        className
      )}
    >
      <li>{t("ivaIncluded")}</li>
      <li className="flex items-center gap-1.5">
        <span>{t("installFee")}:</span>
        {isPlaceholder(fee) ? (
          <PlaceholderChip keyName={fee.key} />
        ) : (
          <span className="text-foreground">${formatMxn(fee, locale)}</span>
        )}
      </li>
      <li className="flex items-center gap-1.5">
        <span>{t("term")}:</span>
        {isPlaceholder(term) ? (
          <PlaceholderChip keyName={term.key} />
        ) : (
          <span className="text-foreground">
            {term === null ? t("noContract") : t("months", { count: term })}
          </span>
        )}
      </li>
      {promo &&
        (isPlaceholder(promo) ? (
          <li>
            <PlaceholderChip keyName={promo.key} />
          </li>
        ) : (
          <li className="text-warn">
            {t("promoUntil", {
              months: promo.months,
              date: formatDate(promo.endsAt, locale),
            })}
          </li>
        ))}
    </ul>
  )
}
