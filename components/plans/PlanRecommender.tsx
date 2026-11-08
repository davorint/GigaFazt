"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Briefcase,
  Cctv,
  Gamepad2,
  House,
  Laptop,
  RotateCcw,
  Sparkles,
  Tv,
  Upload,
  User,
  Users,
  UsersRound,
  Video,
} from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { DialogTitle } from "@/components/ui/dialog"
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
import { motionReduced } from "@/lib/motion"
import { track } from "@/lib/analytics"
import { PriceTag } from "./PriceTag"
import { PriceTerms } from "./PriceTerms"
import { Choice } from "./Choice"

const TOTAL = 3

const PEOPLE_ICONS: Record<People, typeof User> = { "1-2": User, "3-5": Users, "6+": UsersRound }
const USE_ICONS: Record<Use, typeof User> = { gaming: Gamepad2, streaming4k: Tv, homeOffice: Video, creator: Upload, smartHome: Cctv }
const WFH_ICONS: Record<Wfh, typeof User> = { no: House, one: Laptop, several: Briefcase }

/** Scroll to the recommended plan card and flash it (plans/PlanCard `data-plan`). */
function showPlanCard(id: string) {
  const card = document.querySelector<HTMLElement>(`[data-plan="${id}"]`)
  if (!card) return
  card.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth", block: "center" })
  card.classList.remove("plan-flash")
  void card.offsetWidth // restart the animation
  card.classList.add("plan-flash")
  window.setTimeout(() => card.classList.remove("plan-flash"), 2400)
}

/**
 * "¿Qué plan necesito?" (SPEC §3): three native-input steps (fully keyboard
 * usable), then one recommended plan with a one-line reason from the
 * deterministic scoring in lib/recommend.ts. Result is announced via aria-live.
 * Lives in a dialog (RecommenderModal): actions that leave it (contract, show
 * the card) close it first, then act once the dialog has released focus/scroll.
 */
export function PlanRecommender({ onClose }: { onClose: () => void }) {
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
    <div className="flex flex-col p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-fiber/30 bg-fiber/10">
          <Sparkles className="size-[18px] text-fiber" aria-hidden />
        </span>
        <div>
          <DialogTitle render={<h2 />} className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</DialogTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("lead")}</p>
        </div>
      </div>

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
            <p className="proof-figure mt-3 w-fit font-mono text-6xl font-semibold tracking-[-0.05em] sm:text-7xl">
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
            <div className="mt-auto flex flex-wrap gap-2 pt-7">
              <Button
                size="lg"
                className="h-11 flex-1 font-mono text-xs uppercase tracking-wider"
                onClick={() => {
                  selection.selectPlan(recommended.id)
                  track("plan_selected", { planId: recommended.id, context: "recommender" })
                  onClose()
                  window.setTimeout(() => selection.openLead(recommended.id), 220)
                }}
              >
                {t("choose")}
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="h-11 font-mono text-xs uppercase tracking-wider"
                onClick={() => {
                  selection.selectPlan(recommended.id)
                  onClose()
                  window.setTimeout(() => showPlanCard(recommended.id), 260)
                }}
              >
                <ArrowUp />
                {t("showCard")}
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
            <div className="mt-2 flex gap-1.5" aria-hidden>
              {Array.from({ length: TOTAL }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors duration-300",
                    i < step ? "bg-fiber" : i === step ? "bg-fiber shadow-[0_0_10px_var(--color-fiber)]" : "bg-white/[0.08]"
                  )}
                />
              ))}
            </div>

            <fieldset className="mt-5">
              <legend
                ref={focusRef as React.RefObject<HTMLLegendElement>}
                tabIndex={-1}
                className="mb-4 text-lg font-semibold tracking-[-0.01em] outline-none"
              >
                {step === 0 && t("people.legend")}
                {step === 1 && t("uses.legend")}
                {step === 2 && t("wfh.legend")}
              </legend>

              <div className={cn("grid gap-2.5", step === 1 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3")}>
                {step === 0 &&
                  PEOPLE.map((v) => (
                    <Choice
                      key={v}
                      type="radio"
                      name="people"
                      checked={people === v}
                      onChange={() => setPeople(v)}
                      label={t(`people.${v}`)}
                      icon={PEOPLE_ICONS[v]}
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
                      icon={USE_ICONS[v]}
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
                      icon={WFH_ICONS[v]}
                    />
                  ))}
              </div>
            </fieldset>

            <div className="mt-auto flex gap-2 pt-7">
              {step > 0 && (
                <Button type="button" variant="ghost" size="lg" className="h-11" onClick={() => go(step - 1)}>
                  <ArrowLeft />
                  {t("back")}
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
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
