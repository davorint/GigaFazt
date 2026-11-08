import { useLocale, useTranslations } from "next-intl"
import { cn } from "cn"
import { BANDS, BAND_IDS, GENERATIONS, MAX_CHANNEL_MHZ, PLAN_MODEM, TECH_SHORT, type Generation } from "@/lib/wifi"
import { wifi7Plan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"

/**
 * Five Wi-Fi generations side by side (server-rendered: zero JS, readable by
 * search engines and assistive tech). Values are each standard's public
 * figures from lib/wifi.ts, plus a last, lit column for the 1 Gbps plan's
 * actual modem (lib/company.ts; no brand) when a plan includes it.
 */
export function WifiComparison() {
  const t = useTranslations("fiber.wifi")
  const locale = useLocale()
  const fmt = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 })
  const cols: Generation[] = wifi7Plan ? [...GENERATIONS, PLAN_MODEM] : [...GENERATIONS]
  const speed = wifi7Plan ? speedLabel(wifi7Plan.downMbps) : ""
  const lit = (g: Generation) => g.kind === "modem"
  const max = (g: Generation) => (g.maxGbps < 1 ? `${fmt(g.maxGbps * 1000)} Mbps` : `${fmt(g.maxGbps)} Gbps`)

  const rows: { key: string; label: string; cell: (g: Generation) => React.ReactNode }[] = [
    { key: "ieee", label: t("ieee"), cell: (g) => <span className="font-mono">{g.ieee}</span> },
    {
      key: "year",
      label: t("year"),
      cell: (g) =>
        g.year === null ? (
          <span>
            <span aria-hidden>—</span>
            <span className="sr-only">{t("modem.notApplicable")}</span>
          </span>
        ) : (
          <span className="font-mono tabular-nums">{g.year}</span>
        ),
    },
    {
      key: "bands",
      label: t("bands"),
      cell: (g) => (
        <span className="flex flex-wrap gap-1">
          {BAND_IDS.filter((b) => g.bands.includes(b)).map((b) => (
            <span key={b} className="rounded border px-1.5 py-0.5 font-mono text-[0.65rem]" style={{ borderColor: `${BANDS[b].color}55`, color: BANDS[b].color }}>
              {BANDS[b].label}
            </span>
          ))}
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
            <span className="block h-full rounded-full bg-fiber shadow-[0_0_6px_var(--color-fiber)]" style={{ width: `${(g.maxChannelMhz / MAX_CHANNEL_MHZ) * 100}%` }} />
          </span>
        </span>
      ),
    },
    { key: "modulation", label: t("modulation"), cell: (g) => <span className="font-mono">{g.qam}-QAM</span> },
    {
      key: "streams",
      label: t("streams"),
      cell: (g) => (
        <span className="font-mono tabular-nums">
          {g.streams}
          {g.kind === "modem" && <span className="block text-[0.65rem] text-muted-foreground">{t("modem.streamsPerBand", { n: g.streams / g.bands.length })}</span>}
        </span>
      ),
    },
    { key: "tech", label: t("tech"), cell: (g) => <span className="font-mono text-xs">{g.tech.map((k) => TECH_SHORT[k]).join(" · ")}</span> },
  ]

  return (
    // Focusable scroll region (keyboard users can scroll the table on phones).
    <div
      role="region"
      aria-label={t("tableCaption")}
      tabIndex={0}
      className="relative overflow-x-auto rounded-2xl border border-white/10 bg-surface/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <table className="w-full min-w-[900px] border-collapse text-left text-sm">
        <caption className="sr-only">{t("tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-40 bg-surface p-4 align-bottom font-mono text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground">
              {t("generation")}
              <span className="mt-1 block normal-case tracking-normal">{t("maxLabel")}</span>
            </th>
            {cols.map((g) => (
              <th
                key={g.id}
                scope="col"
                className={cn("p-4 align-bottom", lit(g) && "relative bg-gradient-to-b from-cyan-400/[0.12] to-cyan-400/[0.03]")}
              >
                {lit(g) && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />}
                {lit(g) && (
                  <span className="mb-2 inline-block rounded-full border border-fiber/50 px-2 py-0.5 font-mono text-[0.6rem] font-normal uppercase tracking-wider text-fiber">
                    {t("inPlan", { speed })}
                  </span>
                )}
                <span className={cn("block text-lg font-semibold tracking-[-0.02em]", lit(g) ? "text-white" : "text-foreground/85")}>
                  {lit(g) ? t("modem.option") : g.name}
                </span>
                <span className={cn("mt-1 block font-mono text-2xl font-semibold tracking-[-0.04em] tabular-nums", lit(g) ? "text-brand" : "text-foreground/70")}>
                  {max(g)}
                </span>
                {g.bandMaxMbps && (
                  <span className="block font-mono text-[0.65rem] font-normal text-muted-foreground">
                    {g.bands.map((b) => BANDS[b].label).join(" + ")}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/[0.06]">
              <th scope="row" className="sticky left-0 z-10 bg-surface p-4 font-mono text-[0.65rem] font-normal uppercase tracking-wider text-muted-foreground">
                {r.label}
              </th>
              {cols.map((g) => (
                <td key={g.id} className={cn("p-4 align-top", lit(g) ? "bg-cyan-400/[0.04] text-foreground" : "text-foreground/75")}>
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
