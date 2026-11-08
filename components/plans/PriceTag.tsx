import { useLocale, useTranslations } from "next-intl"
import { cn } from "cn"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { formatMxn } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import type { Plan } from "@/lib/types"

/** Large monthly price; with a promo, the promo price + struck regular price. */
export function PriceTag({
  plan,
  size = "lg",
}: {
  plan: Pick<Plan, "priceMxn" | "promo">
  size?: "xl" | "lg" | "sm"
}) {
  const t = useTranslations("plans")
  const locale = useLocale()
  const { priceMxn: price, promo } = plan

  if (isPlaceholder(price)) return <PlaceholderChip keyName={price.key} />

  const activePromo = promo && !isPlaceholder(promo) ? promo : null
  const shown = activePromo ? activePromo.priceMxn : price

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 font-mono">
      <span
        className={cn(
          "font-semibold tracking-tight text-foreground",
          size === "xl" ? "text-5xl" : size === "lg" ? "text-4xl" : "text-xl"
        )}
      >
        ${formatMxn(shown, locale)}
      </span>
      <span className="text-sm text-muted-foreground">{t("perMonth")}</span>
      {activePromo && (
        <s className="text-sm text-muted-foreground">
          <span className="sr-only">{t("regular")}: </span>${formatMxn(price, locale)}
        </s>
      )}
    </p>
  )
}
