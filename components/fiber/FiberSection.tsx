import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { SymmetryLight } from "./SymmetryLight"
import { WhatItMeans } from "./WhatItMeans"
import { LazyTelemetryPanel } from "./LazyTelemetryPanel"
import { LazyLatencyPhysics } from "./LazyLatencyPhysics"
import { DeepDiveCards, deepDiveReady } from "./DeepDiveCards"

/**
 * Symmetrical Fiber (SPEC §4), the flagship section: "Dentro de la fibra"
 * (full-bleed three.js flight into the fiber core), "what it means" tiles,
 * simulated live telemetry,
 * latency physics and deep-dive cards. Heavy widgets are lazy islands.
 */
export function FiberSection() {
  const t = useTranslations()

  return (
    <div className="py-24">
      <div className="reveal mx-auto max-w-7xl px-4 sm:px-6">
        <p className="eyebrow mb-3">[ {t("sections.fiber")} ]</p>
        <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">
          {t("sectionHeads.fiber")}
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">{t("fiber.lead")}</p>
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

      {deepDiveReady() ? (
        <div className="reveal-stagger mt-12 grid gap-8 lg:grid-cols-2">
          <LazyLatencyPhysics />
          <DeepDiveCards />
        </div>
      ) : (
        <div className="reveal mx-auto mt-12 max-w-3xl">
          <LazyLatencyPhysics />
        </div>
      )}

      <div className="mt-12 flex justify-center">
        <a
          href="#plans"
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("fiber.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
      </div>
    </div>
  )
}
