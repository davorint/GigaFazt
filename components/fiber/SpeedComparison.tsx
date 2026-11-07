"use client"

import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SimTag } from "@/components/hud/SimTag"
import { planForLine } from "@/lib/compare"
import { speedLabel } from "@/lib/format"
import { speedup, splitDuration } from "@/lib/fiber-math"
import { selection, type Line } from "@/lib/selection"
import { track } from "@/lib/analytics"
import { GapBar } from "./GapBar"

/**
 * "Tu conexión hoy" vs the recommended plan (SPEC §4), highlighting the upload
 * gap, then a CTA to that plan. `demo` adds the DEMO DATA tag (hard rule #2).
 */
export function SpeedComparison({ line, demo }: { line: Line; demo: boolean }) {
  const t = useTranslations("fiber.speedtest")
  const plan = planForLine(line)
  const times = speedup(line.upMbps, plan.upMbps)
  const alreadyFast = line.downMbps >= plan.downMbps
  const hourIn = splitDuration(3600 / times)
  const speed = speedLabel(plan.downMbps)

  const rows = [
    { key: "down", today: line.downMbps, plan: plan.downMbps },
    { key: "up", today: line.upMbps, plan: plan.upMbps },
  ] as const

  return (
    <div className="mt-8 border-t border-border pt-6">
      {demo && (
        <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <SimTag kind="demo" />
          {t("demoNote")}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_auto]">
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="text-left text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              <th scope="col" className="w-20 pb-2 font-normal">
                <span className="sr-only">—</span>
              </th>
              <th scope="col" className="pb-2 font-normal">{t("today")}</th>
              <th scope="col" className="pb-2 font-normal text-fiber">{t("withPlan", { speed })}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="align-top">
                <th scope="row" className="py-2 text-left text-xs font-normal text-muted-foreground">
                  {r.key === "down" ? "↓" : "↑"} {t(r.key)}
                </th>
                <td className="py-2 pr-4">
                  <span className="text-lg text-foreground">{r.today}</span>{" "}
                  <span className="text-xs text-muted-foreground">Mbps</span>
                  <GapBar value={r.today} max={r.plan} muted />
                </td>
                <td className="py-2">
                  <span className="text-lg text-foreground">{speedLabel(r.plan)}</span>
                  <GapBar value={r.plan} max={r.plan} />
                </td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="py-2 text-left text-xs font-normal text-muted-foreground">
                {t("ping")}
              </th>
              <td className="py-2" colSpan={2}>
                <span className="text-lg text-foreground">{line.pingMs}</span>{" "}
                <span className="text-xs text-muted-foreground">ms</span>
              </td>
            </tr>
          </tbody>
        </table>

        {Number.isFinite(times) && times >= 1.5 && (
          <div className="rounded-lg border border-fiber/30 bg-fiber/5 p-5 md:w-64">
            <p className="font-mono text-2xl font-semibold text-fiber">
              {t("uploadGap", { times })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("uploadGapBody", { time: `${hourIn.value} ${hourIn.unit}` })}
            </p>
          </div>
        )}
      </div>

      {alreadyFast && (
        <p className="mt-4 text-sm text-muted-foreground">{t("alreadyFast")}</p>
      )}
      <p className="mt-3 font-mono text-[0.7rem] text-muted-foreground">{t("planNote")}</p>

      <Button
        size="lg"
        className="mt-5 h-11 font-mono text-xs uppercase tracking-wider"
        onClick={() => {
          track("plan_selected", { planId: plan.id, context: demo ? "speedtest-demo" : "speedtest" })
          selection.openLead(plan.id)
        }}
      >
        {t("cta", { speed })}
        <ArrowRight />
      </Button>
    </div>
  )
}
