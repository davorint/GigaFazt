import { useTranslations } from "next-intl"
import { InView } from "@/components/layout/InView"
import { FinaleStrands } from "./FinaleStrands"
import { FinalCtaActions } from "./FinalCtaActions"
import { RevealHeading } from "@/components/layout/RevealHeading"

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
      <div className="mx-auto w-full max-w-7xl section-pad px-4 text-center sm:px-6">
        <RevealHeading className="display-1 mx-auto max-w-5xl">{t("title")}</RevealHeading>
        <p className="reveal section-lead mx-auto">{t("lead")}</p>
        <FinalCtaActions />
      </div>
    </InView>
  )
}
