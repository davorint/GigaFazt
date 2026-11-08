import { useTranslations } from "next-intl"
import { BANDS, PLAN_MODEM, WALL_LOSS_DB, type MaterialId } from "@/lib/wifi"
import { wifi7Plan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { LazyWifiLab } from "./LazyWifiLab"
import { WifiComparison } from "./WifiComparison"

/**
 * "Así viaja el Wi-Fi por tu depa", its own home section (#wifi) right after
 * Fiber: the simulated apartment lab (lazy island), the one-line insight
 * (walls slow every generation; generations differ in what they do with the
 * signal), the server-rendered comparison table and the qualifying note.
 */
export function WifiSection() {
  const t = useTranslations("fiber.wifi")
  const range = (m: MaterialId) => {
    const v = Object.values(WALL_LOSS_DB[m])
    return `${Math.min(...v)}–${Math.max(...v)}`
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="reveal max-w-2xl">
        <p className="eyebrow mb-3">[ {t("eyebrow")} ]</p>
        <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{t("title")}</h2>
        <p className="mt-3 text-muted-foreground">{t("lead")}</p>
      </div>

      <div className="mt-8">
        <LazyWifiLab />
      </div>

      <p className="reveal mt-12 max-w-3xl border-l-2 border-fiber/70 pl-5 text-lg leading-relaxed text-foreground/90 sm:text-xl">
        {t("insight")}
      </p>

      <div className="reveal mt-10">
        <h3 className="mb-4 text-lg font-semibold tracking-[-0.02em]">{t("tableTitle")}</h3>
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
