import { useLocale, useTranslations } from "next-intl"
import { BANDS, PLAN_MODEM } from "@/lib/wifi"
import { wifi7Plan } from "@/lib/plans"
import { formatNumber, speedLabel } from "@/lib/format"
import { RevealHeading } from "@/components/layout/RevealHeading"
import { ContractButton } from "@/components/conversion/ContractButton"
import { ModemShowcase } from "./ModemShowcase"

/**
 * The Wi-Fi section's opening: the 1 Gbps plan's Wi-Fi 7 modem presented like
 * a product (owner, 2026-11-08: "we need to sell this modem"). A large render
 * beside the pitch, the modem's Wi-Fi capacity as a multiple of the plan, and
 * four specs, all derived from lib/company.ts via PLAN_MODEM (no brand).
 * Renders nothing when no plan includes the modem.
 */
export function ModemSpotlight() {
  const t = useTranslations("fiber.wifi.spotlight")
  const locale = useLocale()
  if (!wifi7Plan) return null
  const plan = wifi7Plan
  const speed = speedLabel(plan.downMbps)
  const fmt = (n: number) => formatNumber(n, locale)
  const n = PLAN_MODEM.streams / PLAN_MODEM.bands.length

  const specs = [
    { value: "MLO", label: t("mlo") },
    { value: `${PLAN_MODEM.qam}-QAM`, label: t("qam") },
    { value: `${PLAN_MODEM.maxChannelMhz} MHz`, label: t("channel") },
    { value: `${n} × ${n}`, label: t("streams") },
  ]

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16">
      {/* The stage bleeds past the grid on large screens: more floor, more air. */}
      <div className="lg:order-2 lg:-mr-16 xl:-mr-28">
        <ModemShowcase
          className="mx-auto h-[360px] w-full sm:h-[520px] lg:h-[600px]"
          caption={t("caption", { speed })}
          callouts={{
            antennas: t("callouts.antennas", { n, bands: PLAN_MODEM.bands.map((b) => BANDS[b].label).join(" + ") }),
            mlo: t("callouts.mlo"),
            speed: t("callouts.speed", { gbps: fmt(PLAN_MODEM.maxGbps) }),
          }}
        />
      </div>

      <div className="lg:order-1">
        <RevealHeading className="display-2">{t("title", { speed })}</RevealHeading>
        <p className="section-lead reveal">{t("lead")}</p>

        <div className="mt-10 flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="flex items-baseline gap-2 font-mono">
            <span className="text-6xl font-semibold tracking-[-0.05em] text-white tabular-nums sm:text-7xl">{fmt(PLAN_MODEM.maxGbps)}</span>
            <span className="text-xl text-muted-foreground">Gbps</span>
          </p>
          <p className="pb-2 text-sm leading-snug text-muted-foreground">
            {t("maxLabel")}
          </p>
        </div>

        <dl className="mt-8 grid grid-cols-2 border-t border-white/10">
          {specs.map((s, i) => (
            <div key={s.value} className={i % 2 === 0 ? "border-b border-white/10 py-4 pr-4" : "border-b border-l border-white/10 py-4 pl-5"}>
              <dt className="font-mono text-base text-foreground tabular-nums">{s.value}</dt>
              <dd className="mt-1 text-sm leading-snug text-muted-foreground">{s.label}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <ContractButton context="wifi-spotlight" planId={plan.id} />
          <p className="text-sm text-muted-foreground">{t("included", { speed })}</p>
        </div>
      </div>
    </div>
  )
}
