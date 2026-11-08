import { useTranslations } from "next-intl"
import { BANDS, PLAN_MODEM, WALL_LOSS_DB, type MaterialId } from "@/lib/wifi"
import { wifi7Plan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { LazyWifiLab } from "./LazyWifiLab"
import { WifiComparison } from "./WifiComparison"
import { ModemSpotlight } from "./ModemSpotlight"

/**
 * Wi-Fi home section (#wifi), right after Fiber: the plan's Wi-Fi 7 modem as a
 * product spotlight first, then the simulated apartment lab (lazy island)
 * that lets visitors compare it with older generations, the one-line insight,
 * the like-for-like comparison table and the qualifying note.
 */
export function WifiSection() {
  const t = useTranslations("fiber.wifi")
  const range = (m: MaterialId) => {
    const v = Object.values(WALL_LOSS_DB[m])
    return `${Math.min(...v)}–${Math.max(...v)}`
  }

  return (
    <div className="mx-auto max-w-7xl section-pad px-4 sm:px-6">
      <ModemSpotlight />

      <div className="mt-28 max-w-3xl sm:mt-40">
        <h3 className="text-3xl font-medium tracking-[-0.035em] sm:text-4xl">{t("title")}</h3>
        <p className="reveal mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">{t("lead")}</p>
      </div>

      <div className="mt-10">
        <LazyWifiLab />
      </div>

      <p className="reveal mt-16 max-w-3xl border-l-2 border-fiber/70 pl-5 text-lg leading-relaxed text-foreground/90 sm:text-xl">
        {t("insight")}
      </p>

      <div className="reveal mt-16">
        <h3 className="text-2xl font-medium tracking-[-0.03em] sm:text-3xl">{t("tableTitle")}</h3>
        <p className="mt-2 mb-6 text-muted-foreground">{t("tableSub")}</p>
        <WifiComparison />
      </div>

      <p className="mt-3 max-w-4xl font-mono text-[0.7rem] leading-relaxed text-muted-foreground">
        {t("note", {
          concrete: range("concrete"),
          brick: range("brick"),
          drywall: range("drywall"),
          speed: wifi7Plan ? speedLabel(wifi7Plan.downMbps) : "",
          bands: PLAN_MODEM.bands.map((b) => BANDS[b].label).join(" + "),
          streams: PLAN_MODEM.streams / PLAN_MODEM.bands.length,
          channel: PLAN_MODEM.maxChannelMhz,
        })}
      </p>
    </div>
  )
}
