import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { SymmetryLight } from "./SymmetryLight"
import { WhatItMeans } from "./WhatItMeans"
import { FiberDetails } from "./FiberDetails"
import { DeepDiveCards, deepDiveReady } from "./DeepDiveCards"
import { RevealHeading } from "@/components/layout/RevealHeading"

/**
 * Symmetrical Fiber (SPEC §4), the flagship section, edited down to one visual
 * and one proof point (pass E): a centered statement (the page's one
 * `display-statement`), "Dentro de la fibra" (full-bleed three.js flight into
 * the fiber core), the "what it means" tiles, then the simulated telemetry and
 * latency physics folded into a disclosure (FiberDetails, lazy on open).
 */
export function FiberSection() {
  const t = useTranslations()

  return (
    <div className="section-pad">
      <div className="mx-auto max-w-7xl px-4 text-center sm:px-6">
        <RevealHeading className="display-statement mx-auto max-w-6xl">{t("sectionHeads.fiber")}</RevealHeading>
        <p className="section-lead reveal mx-auto">{t("fiber.lead")}</p>
      </div>

      {/* Full-bleed: edge to edge, outside the content container. */}
      <div className="mt-16 sm:mt-24">
        <SymmetryLight />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="reveal mt-20 sm:mt-28">
          <WhatItMeans />
        </div>

        {deepDiveReady() && (
          <div className="reveal mt-16">
            <DeepDiveCards />
          </div>
        )}

        <div className="mt-16 sm:mt-20">
          <FiberDetails />
        </div>

        <div className="mt-12 flex justify-center">
          <a
            href="#plans"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("fiber.cta")}
            <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}
