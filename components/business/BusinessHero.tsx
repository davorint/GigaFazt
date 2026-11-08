import { useTranslations } from "next-intl"
import { ArrowDown } from "lucide-react"
import { business } from "@/lib/business"
import { QuoteButton } from "./QuoteButton"

/**
 * /empresas hero, in the page's own "enterprise" language (globals.css
 * `.biz*`): blueprint grid, white display type, and the page's two lines of
 * business as chapter panels: 01 internet service, 02 fiber networks
 * (deployment and cabling). Each panel jumps to its chapter.
 */
export function BusinessHero() {
  const t = useTranslations("business")
  // Internet links in Gbps, the internal network in GbE (Gigabit Ethernet), so the two never read as one.
  const { from, to } = business.internalNetworkGbps
  const chapters = [
    { id: "internet", href: "#business-capacity", figure: business.maxLinkGbps, unit: t("unit"), body: t("chapters.internet.body", { max: business.maxLinkGbps }) },
    { id: "fiber", href: "#business-fiber", figure: to, unit: t("unitLan"), body: t("chapters.fiber.body", { from, to }) },
  ] as const

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="biz-blueprint biz-fade-x pointer-events-none absolute inset-0 [mask-image:radial-gradient(90%_80%_at_60%_40%,#000_35%,transparent_100%)]" />
      <div aria-hidden className="pointer-events-none absolute top-1/3 right-[-10%] h-[42rem] w-[42rem] rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.10),transparent)]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 pt-32 pb-20 sm:px-6 lg:min-h-[calc(100svh-7rem)] lg:grid-cols-[1.1fr_1fr] lg:pt-28">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
            {t("eyebrow")}
          </p>
          <h1 className="biz-display mt-6 text-5xl leading-[0.98] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-[5.25rem]">
            {t("h1")}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-zinc-400">{t("lead")}</p>
          <div className="mt-10">
            <QuoteButton context="business_hero" />
          </div>
          <p className="mt-4 text-sm text-zinc-400">{t("quoteNote")}</p>
        </div>

        {/* The two lines of business, each a way into its chapter. */}
        <nav aria-label={t("chapters.label")} className="grid gap-4">
          {chapters.map((c, i) => (
            <a
              key={c.id}
              href={c.href}
              className="group biz-frame block p-6 transition-colors hover:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--biz-accent)] focus-visible:outline-none sm:p-8"
            >
              <span className="flex items-baseline justify-between gap-4">
                <span className="font-mono text-xs uppercase tracking-[0.25em] text-[var(--biz-accent)]">
                  {String(i + 1).padStart(2, "0")} · {t(`chapters.${c.id}.kicker`)}
                </span>
                <ArrowDown className="size-4 text-zinc-400 transition-transform group-hover:translate-y-0.5 group-hover:text-white" aria-hidden />
              </span>
              <span className="mt-4 flex items-end justify-between gap-6">
                <span className="text-2xl font-medium tracking-[-0.02em] text-white sm:text-3xl">{t(`chapters.${c.id}.title`)}</span>
                <span className="shrink-0 font-mono text-zinc-400">
                  <span className="biz-display text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{c.figure}</span> {c.unit}
                </span>
              </span>
              <span className="mt-3 block max-w-md text-sm leading-relaxed text-zinc-400">{c.body}</span>
            </a>
          ))}
        </nav>
      </div>
    </div>
  )
}
