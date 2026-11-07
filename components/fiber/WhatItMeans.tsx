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

  const dur = (s: number) => {
    const d = splitDuration(s)
    return `${d.value} ${d.unit}`
  }

  const tiles = [
    { key: "upload10", icon: Upload, value: dur(transferSeconds(10, plan.upMbps)) },
    { key: "streams", icon: Clapperboard, value: String(streams4k(plan.downMbps)) },
    { key: "backup", icon: CloudUpload, value: dur(transferSeconds(1000, plan.upMbps)) },
  ] as const

  return (
    <div>
      <h3 className="text-xl font-semibold tracking-[-0.02em]">
        {t("titlePlan", { speed: speedLabel(plan.downMbps) })}
      </h3>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {tiles.map(({ key, icon: Icon, value }) => (
          <li key={key} className="rounded-xl surface p-5">
            <Icon className="size-5 text-fiber" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">{t(key)}</p>
            <p className="mt-4 font-mono text-3xl tabular-nums text-foreground">{value}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("note")}</p>
    </div>
  )
}
