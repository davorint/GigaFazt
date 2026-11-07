"use client"

import { useTranslations } from "next-intl"
import { Clapperboard, CloudUpload, Upload } from "lucide-react"
import { SimTag } from "@/components/hud/SimTag"
import { planForLine } from "@/lib/compare"
import { speedLabel } from "@/lib/format"
import { splitDuration, streams4k, transferSeconds } from "@/lib/fiber-math"
import { useSelection } from "@/lib/selection"

/**
 * "Qué significa" tiles (SPEC §4): 10 GB upload, simultaneous 4K streams and a
 * 1 TB backup, computed (lib/fiber-math.ts) for the plan and, once measured,
 * for the visitor's connection today. Demo lines carry a DEMO DATA tag.
 */
export function WhatItMeans() {
  const t = useTranslations("fiber.means")
  const real = useSelection((s) => s.speedTest)
  const demo = useSelection((s) => s.speedDemo)
  const line = real ?? demo
  const plan = planForLine(line)

  const dur = (s: number) => {
    const d = splitDuration(s)
    return `${d.value} ${d.unit}`
  }

  const tiles = [
    {
      key: "upload10",
      icon: Upload,
      today: line ? dur(transferSeconds(10, line.upMbps)) : null,
      plan: dur(transferSeconds(10, plan.upMbps)),
    },
    {
      key: "streams",
      icon: Clapperboard,
      today: line ? String(streams4k(line.downMbps)) : null,
      plan: String(streams4k(plan.downMbps)),
    },
    {
      key: "backup",
      icon: CloudUpload,
      today: line ? dur(transferSeconds(1000, line.upMbps)) : null,
      plan: dur(transferSeconds(1000, plan.upMbps)),
    },
  ] as const

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
        {!real && demo && <SimTag kind="demo" />}
      </div>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {tiles.map(({ key, icon: Icon, today, plan: planValue }) => (
          <li key={key} className="rounded-xl border border-border bg-surface p-5">
            <Icon className="size-5 text-fiber" aria-hidden />
            <p className="mt-3 text-sm text-muted-foreground">{t(key)}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 font-mono">
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t("today")}</dt>
                <dd className="mt-1 text-xl text-muted-foreground">{today ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[0.65rem] uppercase tracking-wider text-fiber">
                  {t("plan", { speed: speedLabel(plan.downMbps) })}
                </dt>
                <dd className="mt-1 text-xl text-foreground">{planValue}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">
        {line ? null : `${t("runTest")} · `}
        {t("note")}
      </p>
    </div>
  )
}
