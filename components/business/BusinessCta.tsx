import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { QuoteButton } from "./QuoteButton"

/**
 * Closing quote CTA as a framed panel on the blueprint (corner ticks, no
 * glow), plus a way back to the regular plans for small offices.
 */
export function BusinessCta() {
  const t = useTranslations()
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="reveal biz-frame overflow-hidden">
        <div aria-hidden className="biz-blueprint pointer-events-none absolute inset-0 opacity-60 [mask-image:linear-gradient(90deg,transparent,#000_70%)]" />
        <div className="relative grid gap-10 p-8 sm:p-12 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:p-16">
          <div>
            <h2 className="biz-display max-w-2xl text-4xl leading-[1.02] font-semibold tracking-[-0.04em] sm:text-6xl">
              {t("business.ctaTitle")}
            </h2>
            <p className="mt-6 max-w-xl text-zinc-400">{t("business.ctaLead", { area: t("coverage.area") })}</p>
          </div>
          <div className="flex flex-col items-start gap-6 lg:items-end">
            <QuoteButton context="business_cta" />
            <p className="text-sm text-zinc-400 lg:text-right">
              {t("business.smallOffice")}{" "}
              <Link
                href="/planes"
                className="inline-flex items-center gap-1 rounded text-zinc-200 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {t("business.plansLink")}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
