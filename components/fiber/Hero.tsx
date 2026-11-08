import { Fragment } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Users } from "lucide-react"
import { featuredPlan } from "@/lib/plans"
import { company } from "@/lib/company"
import { formatMxn, formatNumber } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { PriceTerms } from "@/components/plans/PriceTerms"
import { FiberBackdrop } from "./FiberBackdrop"
import { HeroPlanStrip } from "./HeroPlanStrip"
import { HeroActions } from "./HeroActions"

/**
 * Hero (SPEC §2): the fiber scene behind, an offer-led pitch in front. One
 * price only, the featured gigabit plan in the H1, with its terms right under
 * the pitch (hard rule #5); the lineup's other prices live in Plans and the
 * Wi-Fi 7 modem in the 1 Gbps plan card. One lineup for everyone.
 */
/** Staggered entrance delay (ms) for the blocks under the headline. */
const rise = (ms: number) => ({ "--d": `${ms}ms` }) as React.CSSProperties

/**
 * Splits the headline into words that rise in one by one (globals.css
 * .hero-word). A rich chunk (the price in the brand gradient) stays one unit,
 * and punctuation glued to a unit stays with it so it can't wrap alone.
 */
function riseWords(node: React.ReactNode): React.ReactNode {
  const parts = Array.isArray(node) ? node : [node]
  const units: React.ReactNode[][] = []
  let open = false // the last unit can still take glued text
  for (const part of parts) {
    if (typeof part !== "string") {
      if (open) units[units.length - 1].push(part)
      else units.push([part])
      open = true
      continue
    }
    for (const tok of part.split(/(\s+)/)) {
      if (!tok) continue
      if (/^\s+$/.test(tok)) {
        units.push([" "])
        open = false
      } else if (open) units[units.length - 1].push(tok)
      else {
        units.push([tok])
        open = true
      }
    }
  }
  let i = 0
  return units.map((u, k) =>
    u.length === 1 && u[0] === " " ? (
      " "
    ) : (
      <span key={k} className="hero-word">
        <span style={{ "--i": i++ } as React.CSSProperties}>
          {u.map((x, j) => (
            <Fragment key={j}>{x}</Fragment>
          ))}
        </span>
      </span>
    )
  )
}

const H1_CLASS = "display-1 block"

export function Hero() {
  const t = useTranslations("hero")
  const locale = useLocale()
  const featuredPrice = featuredPlan.priceMxn

  const headline = (brand: boolean) =>
    riseWords(
      isPlaceholder(featuredPrice)
        ? t("h1NoPrice")
        : t.rich("h1", {
            price: formatMxn(featuredPrice, locale),
            hl: (chunks) => <span className={brand ? "text-brand" : undefined}>{chunks}</span>,
          })
    )

  return (
    <div className="hero-root relative isolate flex min-h-screen flex-col overflow-hidden">
      <div className="hero-backdrop-exit absolute inset-0">
        <FiberBackdrop />
      </div>

      <div className="hero-exit relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-4 pt-24 pb-12 sm:px-6">
        <p className="eyebrow hero-rise" style={rise(0)}>[ {t("eyebrow")} ]</p>

        {/* The headline plus an aria-hidden copy on top that carries a band of
            light sweeping right → left, from the node (globals.css .hero-sweep:
            off under reduced motion, paused animations and screenshots). */}
        <div className="relative mt-6 max-w-6xl">
          <h1 className={H1_CLASS}>{headline(true)}</h1>
          <span aria-hidden className={`hero-sweep pointer-events-none absolute inset-0 ${H1_CLASS}`}>
            {headline(false)}
          </span>
        </div>

        <p className="hero-rise mt-8 max-w-xl text-lg leading-relaxed text-muted-foreground" style={rise(520)}>
          {t("subhead")}
        </p>

        {/* Hard rule #5: the H1 price's fee and term right under the pitch (the
            promo chip waits in Plans until BUSINESS.md sets it). */}
        <div className="hero-rise" style={rise(620)}>
          <PriceTerms plan={featuredPlan} inline hidePendingPromo className="mt-5" />
        </div>

        <div className="hero-rise mt-8 flex flex-wrap items-center gap-3" style={rise(720)}>
          <HeroActions viewPlans={t("viewPlans")} coverageLink={t("coverageLink")} />
        </div>

        {!isPlaceholder(company.network.clients) && (
          <p className="hero-rise mt-6 flex items-center gap-2 text-sm text-muted-foreground" style={rise(820)}>
            <Users className="size-4 text-ok" aria-hidden />
            {t("clients", { count: formatNumber(company.network.clients, locale, 0) })}
          </p>
        )}
      </div>

      <HeroPlanStrip className="hero-rise" style={rise(920)} />
    </div>
  )
}
