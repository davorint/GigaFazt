import type { ReactNode } from "react"
import { useLocale, useTranslations } from "next-intl"
import { cn } from "cn"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { addOns, plans } from "@/lib/plans"
import { company } from "@/lib/company"
import { formatMxn, speedLabel } from "@/lib/format"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import type { Plan } from "@/lib/types"
import { PriceTag } from "./PriceTag"
import { feeLabel } from "@/lib/format"

/**
 * ComparisonTable (SPEC §3). Plain semantic table (server-rendered, no JS):
 * plans as columns, features as rows. The wrapper scrolls on both axes so the
 * header row sticks to the top and the feature column to the left, and it
 * scrolls horizontally on mobile.
 */
export function ComparisonTable() {
  const t = useTranslations("compare")
  const tp = useTranslations("plans")
  const locale = useLocale()
  const tv = addOns.find((a) => a.id === "tv")

  const chip = <T,>(v: Maybe<T>, render: (x: T) => ReactNode) =>
    isPlaceholder(v) ? <PlaceholderChip keyName={v.key} /> : render(v)

  const rows: { key: string; label: string; cell: (p: Plan) => ReactNode }[] = [
    { key: "download", label: t("download"), cell: (p) => tp("upToSpeed", { speed: speedLabel(p.downMbps) }) },
    { key: "upload", label: t("upload"), cell: (p) => tp("upToSpeed", { speed: speedLabel(p.upMbps) }) },
    { key: "technology", label: t("technology"), cell: (p) => chip(p.technology, (x) => x) },
    { key: "latency", label: t("latency"), cell: () => t("latencyValue") },
    {
      key: "router",
      label: t("router"),
      cell: (p) => chip(p.includes, (x) => x.map((id) => tp(`include.${id}`)).join(", ")),
    },
    {
      key: "tv",
      label: t("tv", { channels: tv?.contents?.channels ?? 0 }),
      cell: () =>
        tv ? chip(tv.priceMxn, (x) => t("tvValue", { price: formatMxn(x, locale) })) : "—",
    },
    {
      key: "installTime",
      label: t("installTime"),
      cell: () => chip(company.terms.installDays, (x) => x),
    },
    {
      key: "installFee",
      label: t("installFee"),
      cell: (p) => chip(p.installFeeMxn, (x) => feeLabel(x, locale, tp("free"))),
    },
    {
      key: "term",
      label: t("term"),
      cell: (p) =>
        chip(p.contractMonths, (x) => (x === null ? tp("noContract") : tp("months", { count: x }))),
    },
    { key: "price", label: t("price"), cell: (p) => <PriceTag plan={p} size="sm" /> },
  ]

  return (
    <div>
      <div
        role="region"
        aria-label={t("caption")}
        tabIndex={0}
        className="max-h-[80vh] overflow-auto rounded-xl border border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{t("caption")}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky top-0 left-0 z-20 border-b border-border bg-surface px-4 py-3 text-left font-mono text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground"
              >
                {t("feature")}
              </th>
              {plans.map((p) => (
                <th
                  key={p.id}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 border-b border-border bg-surface px-4 py-3 text-left font-mono text-base font-semibold",
                    p.highlight && "text-fiber"
                  )}
                >
                  {tp("upToSpeed", { speed: speedLabel(p.downMbps) })}
                  {p.highlight && (
                    <span className="ml-2 align-middle text-[0.6rem] font-normal uppercase tracking-wider">
                      {tp("popular")}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-border bg-surface px-4 py-3 text-left font-normal text-muted-foreground"
                >
                  {row.label}
                </th>
                {plans.map((p) => (
                  <td
                    key={p.id}
                    className={cn(
                      "border-b border-border bg-background px-4 py-3 font-mono",
                      p.highlight && "bg-fiber/[0.04]"
                    )}
                  >
                    {row.cell(p)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("latencyNote")}</p>
    </div>
  )
}
