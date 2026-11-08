"use client"

import { useTranslations } from "next-intl"
import { Clapperboard, CloudUpload, Upload } from "lucide-react"
import { getPlan, plans } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { splitDuration, streams4k, transferSeconds } from "@/lib/fiber-math"
import { useSelection } from "@/lib/selection"

/**
 * "Qué significa" tiles (SPEC §4): 10 GB upload, simultaneous 4K screens and a
 * 1 TB backup, computed (lib/fiber-math.ts) for the visitor's selected plan.
 * Follows the plan picked in "Simetría en luz", the plans or the add-ons.
 */
export function WhatItMeans() {
  const t = useTranslations("fiber.means")
  const planId = useSelection((s) => s.planId)
  const plan = getPlan(planId) ?? plans[plans.length - 1]

  const tiles = [
    { key: "upload10", icon: Upload, ...splitDuration(transferSeconds(10, plan.upMbps)) },
    { key: "streams", icon: Clapperboard, value: String(streams4k(plan.downMbps)), unit: null },
    { key: "backup", icon: CloudUpload, ...splitDuration(transferSeconds(1000, plan.upMbps)) },
  ] as const

  return (
    <div>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">
        {t("titlePlan", { speed: speedLabel(plan.downMbps) })}
      </h3>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {tiles.map(({ key, icon: Icon, value, unit }) => (
          <li key={key} className="flex flex-col rounded-xl surface p-5 sm:p-6">
            <div className="flex items-center gap-2.5">
              <Icon className="size-4 shrink-0 text-fiber" aria-hidden />
              <p className="text-sm text-muted-foreground">{t(key)}</p>
            </div>
            <p className="mt-6 flex items-baseline gap-2 font-mono tabular-nums">
              <span className="text-6xl leading-none font-medium tracking-[-0.05em] text-foreground [text-shadow:0_0_32px_rgb(6_182_212_/_0.35)] sm:text-7xl">
                {value}
              </span>
              {unit && <span className="text-xl text-fiber">{unit}</span>}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("note")}</p>
    </div>
  )
}
