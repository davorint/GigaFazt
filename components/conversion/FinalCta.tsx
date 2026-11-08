import { useTranslations } from "next-intl"
import { InView } from "@/components/layout/InView"
import { FinaleStrands } from "./FinaleStrands"
import { FinalCtaActions } from "./FinalCtaActions"

/**
 * Final CTA (SPEC §8) as the page's closing scene: near full-screen, the
 * hero's fiber strands converge from both edges behind a large headline, then
 * the selected-plan ticket and the actions (client island). The first time the
 * scene is in view the ticket flashes once, as if lit by the strands
 * (`.finale-ticket`, globals.css). The address-check
 * input was removed by the owner.
 */
export function FinalCta() {
  const t = useTranslations("cta")

  return (
    <InView className="finale relative isolate flex min-h-[88svh] items-center overflow-hidden">
      <FinaleStrands />
      <div className="reveal mx-auto w-full max-w-7xl px-4 py-28 text-center sm:px-6">
        <p className="eyebrow mb-4">[ {t("eyebrow")} ]</p>
        <h2 className="mx-auto max-w-4xl text-balance text-5xl leading-[1.02] font-semibold tracking-[-0.035em] sm:text-6xl lg:text-7xl">
          {t("title")}
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">{t("lead")}</p>
        <FinalCtaActions />
      </div>
    </InView>
  )
}
