import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { InView } from "@/components/layout/InView"
import { IsoBuilding } from "./IsoBuilding"
import { QuoteButton } from "./QuoteButton"

/**
 * Closing scene: near full-screen, the building schematic fully lit behind a
 * large centered headline (its packets run while in view), a violet floor
 * light, then the one action. A way back to the regular plans for small
 * offices stays as a quiet line.
 */
export function BusinessCta() {
  const t = useTranslations()
  return (
    <InView className="relative isolate flex min-h-[92svh] items-center overflow-hidden border-t border-[var(--biz-line)]">
      <div aria-hidden className="biz-blueprint pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(70%_70%_at_50%_55%,#000_10%,transparent_100%)]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[-30%] -z-10 mx-auto h-[40rem] max-w-5xl rounded-full bg-[radial-gradient(closest-side,rgb(167_139_250/0.28),transparent)]" />
      <div aria-hidden className="biz-finale-building pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
        <IsoBuilding uid="iso-cta" labels={false} className="h-[110%] w-auto max-w-none opacity-45" />
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_45%_at_50%_50%,rgb(6_6_8/0.85),transparent)]" />

      <div className="mx-auto w-full max-w-5xl px-4 py-28 text-center sm:px-6">
        <h2 className="reveal biz-display mx-auto max-w-4xl text-5xl leading-[0.98] font-[450] tracking-[-0.045em] text-balance sm:text-7xl lg:text-[6.5rem]">
          {t("business.ctaTitle")}
        </h2>
        <p className="reveal mx-auto mt-8 max-w-xl text-lg leading-relaxed text-zinc-300">{t("business.ctaLead", { area: t("coverage.area") })}</p>
        <div className="reveal mt-12 flex justify-center">
          <QuoteButton context="business_cta" className="min-h-14 px-8 text-base" />
        </div>
        <p className="reveal mt-10 text-sm text-zinc-400">
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
    </InView>
  )
}
