"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { plans, getPlan, wifi7Plan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import {
  PEOPLE,
  USES,
  WFH,
  recommend,
  type People,
  type RecommendResult,
  type Use,
  type Wfh,
} from "@/lib/recommend"
import { selection } from "@/lib/selection"
import { track } from "@/lib/analytics"
import { PriceTag } from "./PriceTag"
import { PriceTerms } from "./PriceTerms"
import { Choice } from "./Choice"

const TOTAL = 3

/**
 * "¿Qué plan necesito?" (SPEC §3): three native-input steps (fully keyboard
 * usable), then one recommended plan with a one-line reason from the
 * deterministic scoring in lib/recommend.ts. Result is announced via aria-live.
 */
export function PlanRecommender() {
  const t = useTranslations("recommender")
  const [step, setStep] = useState(0)
  const [people, setPeople] = useState<People | null>(null)
  const [uses, setUses] = useState<Use[]>([])
  const [wfh, setWfh] = useState<Wfh | null>(null)
  const [result, setResult] = useState<RecommendResult | null>(null)
  const focusRef = useRef<HTMLElement>(null)
  const interacted = useRef(false)

  // Move focus to the new step's legend (or the result) after navigation.
  useEffect(() => {
    if (interacted.current) focusRef.current?.focus()
  }, [step, result])

  const go = (n: number) => {
    interacted.current = true
    setStep(n)
  }

  const finish = () => {
    if (!people || !wfh) return
    interacted.current = true
    const r = recommend(
      {
        people,
        uses,
        wfh,
      },
      plans
    )
    setResult(r)
    track("recommender_completed", { planId: r.planId, score: r.score })
  }

  const restart = () => {
    interacted.current = true
    setResult(null)
    setPeople(null)
    setUses([])
    setWfh(null)
    setStep(0)
  }

  const canNext = step === 0 ? people !== null : step === 1 ? true : wfh !== null
  const recommended = result ? getPlan(result.planId) : undefined

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-surface p-6">
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t("lead")}</p>

      <div className="mt-6 flex flex-1 flex-col">
        {result && recommended ? (
          // Focus lands on the whole result (read in full once), not a live region.
          <div
            ref={focusRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            role="group"
            aria-label={`${t("resultEyebrow")}: ${speedLabel(recommended.downMbps)}. ${t(`reason.${result.reason}`)}`}
            className="flex flex-1 flex-col outline-none"
          >
            <p className="eyebrow">
              [ {t("resultEyebrow")} ]
            </p>
            <p className="mt-3 font-mono text-5xl font-semibold tracking-[-0.04em]">
              {speedLabel(recommended.downMbps)}
            </p>
            <p className="mt-3 text-base">{t(`reason.${result.reason}`)}</p>
            {recommended.id === wifi7Plan?.id && (
              <p className="mt-2 text-sm text-muted-foreground">{t("wifi7")}</p>
            )}
            <div className="mt-4">
              <PriceTag plan={recommended} size="sm" />
              <PriceTerms plan={recommended} inline className="mt-2" />
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-6">
              <Button
                size="lg"
                className="h-11 flex-1 font-mono text-xs uppercase tracking-wider"
                onClick={() => {
                  selection.selectPlan(recommended.id)
                  track("plan_selected", { planId: recommended.id, context: "recommender" })
                  selection.openLead(recommended.id)
                }}
              >
                {t("choose")}
              </Button>
              <Button variant="ghost" size="lg" className="h-11" onClick={restart}>
                <RotateCcw />
                {t("restart")}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault()
              if (!canNext) return
              if (step < TOTAL - 1) go(step + 1)
              else finish()
            }}
          >
            <p className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {t("step", { n: step + 1, total: TOTAL })}
            </p>
            <div className="mt-1 flex gap-1" aria-hidden>
              {Array.from({ length: TOTAL }, (_, i) => (
                <span
                  key={i}
                  className={cn("h-0.5 flex-1 rounded-full", i <= step ? "bg-fiber" : "bg-muted")}
                />
              ))}
            </div>

            <fieldset className="mt-5">
              <legend
                ref={focusRef as React.RefObject<HTMLLegendElement>}
                tabIndex={-1}
                className="mb-3 text-base font-medium outline-none"
              >
                {step === 0 && t("people.legend")}
                {step === 1 && t("uses.legend")}
                {step === 2 && t("wfh.legend")}
              </legend>

              <div className="grid gap-2">
                {step === 0 &&
                  PEOPLE.map((v) => (
                    <Choice
                      key={v}
                      type="radio"
                      name="people"
                      checked={people === v}
                      onChange={() => setPeople(v)}
                      label={t(`people.${v}`)}
                    />
                  ))}
                {step === 1 &&
                  USES.map((v) => (
                    <Choice
                      key={v}
                      type="checkbox"
                      name="uses"
                      checked={uses.includes(v)}
                      onChange={(on) =>
                        setUses((u) => (on ? [...u, v] : u.filter((x) => x !== v)))
                      }
                      label={t(`uses.${v}`)}
                    />
                  ))}
                {step === 2 &&
                  WFH.map((v) => (
                    <Choice
                      key={v}
                      type="radio"
                      name="wfh"
                      checked={wfh === v}
                      onChange={() => setWfh(v)}
                      label={t(`wfh.${v}`)}
                    />
                  ))}
              </div>
            </fieldset>

            <div className="mt-auto flex gap-2 pt-6">
              {step > 0 && (
                <Button type="button" variant="ghost" size="lg" className="h-11" onClick={() => go(step - 1)}>
                  <ArrowLeft />
                  {t("back")}
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                variant="outline"
                disabled={!canNext}
                className="ml-auto h-11 font-mono text-xs uppercase tracking-wider"
              >
                {step < TOTAL - 1 ? t("next") : t("seeResult")}
                <ArrowRight />
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
