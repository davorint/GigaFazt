import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { SymmetryLight } from "./SymmetryLight"
import { WhatItMeans } from "./WhatItMeans"
import { LazyTelemetryPanel } from "./LazyTelemetryPanel"
import { DeepDiveCards, deepDiveReady } from "./DeepDiveCards"
import { RevealHeading } from "@/components/layout/RevealHeading"

/**
 * Symmetrical Fiber (SPEC §4), the flagship section: "Dentro de la fibra"
 * (full-bleed three.js flight into the fiber core), "what it means" tiles,
 * simulated live telemetry,
 * latency physics and deep-dive cards. Heavy widgets are lazy islands.
 */
export function FiberSection() {
  const t = useTranslations()

  return (
    <div className="section-pad">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <p className="eyebrow mb-3">[ {t("sections.fiber")} ]</p>
        <RevealHeading className="display-2 max-w-4xl">{t("sectionHeads.fiber")}</RevealHeading>
        <p className="section-lead reveal">{t("fiber.lead")}</p>
      </div>

      {/* Full-bleed: edge to edge, outside the content container. */}
      <div className="mt-10">
        <SymmetryLight />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <div className="reveal mt-20">
        <WhatItMeans />
      </div>

      <div className="reveal mt-12">
        <LazyTelemetryPanel />
      </div>

      {/* Latency physics now lives inside the live-network panel. */}
      {deepDiveReady() && (
        <div className="reveal mt-12">
          <DeepDiveCards />
        </div>
      )}

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
