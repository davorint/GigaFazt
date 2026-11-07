import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Link } from "@/i18n/navigation"
import { statesInList } from "@/lib/geo/state-names"
import { QuoteButton } from "./QuoteButton"

/** Closing quote CTA, plus a way back to the regular plans for small offices. */
export function BusinessCta() {
  const t = useTranslations()
  const locale = useLocale()
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6">
      <div className="hud-brackets relative overflow-hidden rounded-2xl surface px-6 py-12 text-center sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 max-w-xl rounded-full bg-fiber/15 blur-3xl" />
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-5xl">{t("business.ctaTitle")}</h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
          {t("business.ctaLead", { states: statesInList((k) => t(`states.${k}`), locale) })}
        </p>
        <div className="mt-8 flex justify-center">
          <QuoteButton context="business_cta" />
        </div>
        <p className="mt-8 text-sm text-muted-foreground">
          {t("business.smallOffice")}{" "}
          <Link href="/planes" className="inline-flex items-center gap-1 rounded text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            {t("business.plansLink")}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </div>
    </div>
  )
}
