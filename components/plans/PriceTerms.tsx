import { useLocale, useTranslations } from "next-intl"
import { cn } from "cn"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { formatDate } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import type { Plan } from "@/lib/types"
import { feeLabel } from "@/lib/format"

/**
 * The small mono lines that must sit next to every price (hard rule #5):
 * MXN + IVA, install fee, contract term and promo end date. Placeholders render
 * as visible chips. Hook-only (no state), so it works in server and client trees.
 */
export function PriceTerms({
  plan,
  className,
  inline = false,
  quiet = false,
  hidePendingPromo = false,
}: {
  plan: Pick<Plan, "installFeeMxn" | "contractMonths" | "promo">
  className?: string
  inline?: boolean
  /** Lower visual weight (plan cards): the speed and price lead, terms follow. */
  quiet?: boolean
  /**
   * Hero only: skip the promo line while it is still a BUSINESS.md
   * placeholder. The chip stays visible next to every price in Plans and the
   * final CTA (hard rules #1/#5); the first screen leads with real terms.
   */
  hidePendingPromo?: boolean
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
          <span className={fee === 0 ? cn("text-ok", !quiet && "font-semibold") : "text-foreground"}>{feeLabel(fee, locale, t("free"))}</span>
        )}
      </li>
      {term === null ? (
        <li className={cn("text-ok", !quiet && "font-semibold")}>{t("noContract")}</li>
      ) : (
        <li className="flex items-center gap-1.5">
          <span>{t("term")}:</span>
          {isPlaceholder(term) ? (
            <PlaceholderChip keyName={term.key} />
          ) : (
            <span className="text-foreground">{t("months", { count: term })}</span>
          )}
        </li>
      )}
      {promo &&
        !(hidePendingPromo && isPlaceholder(promo)) &&
        (isPlaceholder(promo) ? (
          <li className="flex items-center gap-1.5">
            <span>{t("promo")}:</span>
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
