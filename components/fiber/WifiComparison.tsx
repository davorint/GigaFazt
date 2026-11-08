import { useLocale, useTranslations } from "next-intl"
import { Check, Minus } from "lucide-react"
import { cn } from "cn"
import { GENERATIONS, MAX_CHANNEL_MHZ, lineup, type Generation } from "@/lib/wifi"
import { wifi7Plan } from "@/lib/plans"
import { formatNumber, speedLabel } from "@/lib/format"

/**
 * A home modem from each generation side by side, all with the plan modem's
 * layout (2.4 + 5 GHz, 2 × 2 per band; lib/wifi.ts), so the comparison is like
 * for like and the plan's Wi-Fi 7 modem leads it. Server-rendered (zero JS,
 * readable by search engines and assistive tech). Each speed has a bar on one
 * scale with a marker at the plan's speed, and its multiple of the plan.
 */
export function WifiComparison() {
  const t = useTranslations("fiber.wifi")
  const locale = useLocale()
  const fmt = (n: number) => formatNumber(n, locale)
  const cols = lineup(!!wifi7Plan)
  const speed = wifi7Plan ? speedLabel(wifi7Plan.downMbps) : ""
  const planGbps = wifi7Plan ? wifi7Plan.downMbps / 1000 : null
  const top = Math.max(...cols.map((g) => g.maxGbps))
  const lit = (g: Generation) => g.kind === "modem"
  const max = (g: Generation) => (g.maxGbps < 1 ? `${fmt(g.maxGbps * 1000)} Mbps` : `${fmt(g.maxGbps)} Gbps`)
  // The modem's generation year (the standard's), never a product date.
  const year = (g: Generation) => g.year ?? GENERATIONS.find((s) => s.ieee === g.ieee)?.year ?? null

  const yesNo = (on: boolean) =>
    on ? (
      <span className="inline-flex items-center gap-1.5 text-fiber">
        <Check className="size-4" aria-hidden />
        <span className="sr-only">{t("yes")}</span>
      </span>
    ) : (
      <span className="text-muted-foreground/60">
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">{t("no")}</span>
      </span>
    )

  const rows: { key: string; label: string; cell: (g: Generation) => React.ReactNode }[] = [
    {
      key: "links",
      label: t("linksAtOnce"),
      cell: (g) => (
        <span className="font-mono tabular-nums">
          {g.mlo ? 2 : 1}
          {g.mlo && <span className="ml-1.5 text-xs text-fiber">MLO</span>}
        </span>
      ),
    },
    {
      key: "modulation",
      label: t("modulation"),
      cell: (g) => (
        <span className="block">
          <span className="font-mono">{g.qam}-QAM</span>
          <span className="block text-[0.7rem] text-muted-foreground">{t("bits", { n: Math.log2(g.qam) })}</span>
        </span>
      ),
    },
    {
      key: "channel",
      label: t("channel"),
      cell: (g) => (
        <span className="block">
          <span className="font-mono tabular-nums">{g.maxChannelMhz} MHz</span>
          <span aria-hidden className="mt-1.5 block h-1 w-full rounded-full bg-white/[0.07]">
            <span className="block h-full rounded-full bg-fiber" style={{ width: `${(g.maxChannelMhz / MAX_CHANNEL_MHZ) * 100}%` }} />
          </span>
        </span>
      ),
    },
    { key: "ofdma", label: t("ofdmaRow"), cell: (g) => yesNo(g.ofdma) },
    { key: "ieee", label: t("ieee"), cell: (g) => <span className="font-mono">{g.ieee}</span> },
    { key: "year", label: t("standardYear"), cell: (g) => <span className="font-mono tabular-nums">{year(g)}</span> },
  ]

  return (
    // Focusable scroll region (keyboard users can scroll the table on phones).
    <div
      role="region"
      aria-label={t("tableCaption")}
      tabIndex={0}
      className="relative overflow-x-auto rounded-2xl border border-white/10 bg-surface/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <table className="w-full min-w-[820px] border-collapse text-left text-sm">
        <caption className="sr-only">{t("tableCaption")}</caption>
        <colgroup>
          <col className="w-44" />
          {cols.map((g) => (
            <col key={g.id} className={lit(g) ? "w-[30%]" : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface p-5 align-bottom font-mono text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground">
              {t("generation")}
              <span className="mt-1 block normal-case tracking-normal">{t("maxLabel")}</span>
              {planGbps && (
                <span className="mt-3 flex items-center gap-2 normal-case tracking-normal">
                  <span aria-hidden className="h-3 border-l border-dashed border-white/70" />
                  {t("planMarker", { speed })}
                </span>
              )}
            </th>
            {cols.map((g) => (
              <th
                key={g.id}
                scope="col"
                className={cn("p-5 align-bottom font-normal", lit(g) && "relative bg-gradient-to-b from-cyan-400/[0.16] via-cyan-400/[0.06] to-cyan-400/[0.03]")}
              >
                {lit(g) && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />}
                {lit(g) && (
                  <span className="mb-3 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-fiber/50 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-fiber">
                      {t("inPlan", { speed })}
                    </span>
                    <span className="rounded-full border border-white/20 px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider text-foreground/80">
                      {t("newest")}
                    </span>
                  </span>
                )}
                <span className={cn("block font-semibold tracking-[-0.02em]", lit(g) ? "text-xl text-white" : "text-lg text-foreground/80")}>
                  {lit(g) ? t("modem.option") : g.name}
                  {lit(g) && <span className="ml-2 font-mono text-sm font-normal text-fiber">{g.name}</span>}
                </span>
                <span
                  className={cn(
                    "mt-1 block font-mono font-semibold tracking-[-0.04em] tabular-nums",
                    lit(g) ? "text-4xl text-white" : "text-2xl text-foreground/60"
                  )}
                >
                  {max(g)}
                </span>
                {/* One scale for every column; the dashed tick is the plan's speed. */}
                <span aria-hidden className="relative mt-3 block h-1.5 w-full rounded-full bg-white/[0.07]">
                  <span
                    className={cn("block h-full rounded-full", lit(g) ? "bg-fiber shadow-[0_0_12px_var(--color-fiber)]" : "bg-white/35")}
                    style={{ width: `${(g.maxGbps / top) * 100}%` }}
                  />
                  {planGbps && (
                    <span className="absolute -top-1 -bottom-1 border-l border-dashed border-white/70" style={{ left: `${(planGbps / top) * 100}%` }} />
                  )}
                </span>
                {planGbps && (
                  <span className={cn("mt-2 block font-mono text-xs tabular-nums", lit(g) ? "text-fiber" : g.maxGbps < planGbps ? "text-warn" : "text-muted-foreground")}>
                    {t("vsPlan", { x: fmt(g.maxGbps / planGbps), speed })}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/[0.06]">
              <th scope="row" className="sticky left-0 z-10 bg-surface p-5 font-mono text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground">
                {r.label}
              </th>
              {cols.map((g) => (
                <td key={g.id} className={cn("p-5 align-top", lit(g) ? "bg-cyan-400/[0.04] text-foreground" : "text-foreground/70")}>
                  {r.cell(g)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
