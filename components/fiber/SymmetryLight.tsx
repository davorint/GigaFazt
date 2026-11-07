"use client"

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { cn } from "cn"
import { SimTag } from "@/components/hud/SimTag"
import { ContractButton } from "@/components/conversion/ContractButton"
import { getPlan, plans } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { selection, useSelection } from "@/lib/selection"
import { useReducedMotion } from "@/lib/motion"
import { SceneBoundary, canUseWebGL } from "./SceneBoundary"
import { SymmetryPoster } from "./SymmetryPoster"
import type { StreamTarget } from "./SymmetryScene"

// three.js only loads through this dynamic import, never in the initial bundle.
const SymmetryScene = dynamic(() => import("./SymmetryScene").then((m) => m.SymmetryScene), { ssr: false })

type Mode = "fiber" | "asym"

const CYAN = "#22d3ee"
const ICE = "#67e8f9"
const AMBER = "#fbbf24"
/** Illustrative asymmetric ratio (download ÷ upload), labelled as an example. */
const ASYM_RATIO = 10
const MAX_MBPS = Math.max(...plans.map((p) => p.downMbps))

function targets(downMbps: number, mode: Mode): { down: StreamTarget; up: StreamTarget; upMbps: number } {
  const frac = downMbps / MAX_MBPS
  const density = 0.3 + 0.7 * frac
  const speed = 1.4 + 2.6 * frac
  const down = { density, speed, color: CYAN }
  if (mode === "fiber") return { down, up: { density, speed, color: ICE }, upMbps: downMbps }
  return {
    down,
    up: { density: Math.max(0.12, density / ASYM_RATIO), speed: speed * 0.35, color: AMBER, glow: 2.2 },
    upMbps: Math.round(downMbps / ASYM_RATIO),
  }
}

/** Native radios styled as a segmented control (keyboard-native, one tab stop). */
function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string
  name: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{legend}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-border bg-background/60 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1.5 font-mono text-xs transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              value === o.value ? "bg-fiber/15 text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * "Simetría en luz" (replaces the speed test, owner 2026-11-07): an interactive
 * three.js view of download and upload as light. The plan picker drives the
 * site-wide selected plan, so "Qué significa", the add-ons total and the final
 * CTA follow it. Reduced motion / paused animations / no WebGL → static SVG.
 */
export function SymmetryLight() {
  const t = useTranslations("fiber.symmetry")
  const planId = useSelection((s) => s.planId)
  const plan = getPlan(planId) ?? plans[plans.length - 1]
  const [mode, setMode] = useState<Mode>("fiber")
  const { down, up, upMbps } = targets(plan.downMbps, mode)

  const stage = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()
  const [mobile, setMobile] = useState(false)
  const [mount, setMount] = useState(false)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const sync = () => setMobile(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  // Mount the scene only near the viewport (one live WebGL context per region)
  // and only with motion on; drop it when scrolled away or paused.
  useEffect(() => {
    const el = stage.current
    if (reduced || failed || !el || !canUseWebGL()) return
    const req = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200))
    const cancel = window.cancelIdleCallback ?? window.clearTimeout
    let idle: number | undefined
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          idle = req(() => setMount(true)) as unknown as number
        } else {
          if (idle !== undefined) cancel(idle)
          setMount(false)
          setReady(false)
        }
      },
      { rootMargin: "200px" }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (idle !== undefined) cancel(idle)
      setMount(false)
      setReady(false)
    }
  }, [reduced, failed])

  const live = mount && !failed && !reduced
  const downLabel = speedLabel(plan.downMbps)
  const upLabel = speedLabel(upMbps)

  return (
    <div className="hud-brackets rounded-xl border border-border bg-surface p-5 sm:p-8">
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("desc")}</p>

      <div className="mt-6 flex flex-wrap gap-x-8 gap-y-4">
        <Segmented<Mode>
          legend={t("modeLegend")}
          name="symmetry-mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "fiber", label: t("fiber") },
            { value: "asym", label: t("asym") },
          ]}
        />
        <Segmented<string>
          legend={t("planLegend")}
          name="symmetry-plan"
          value={plan.id}
          onChange={(id) => selection.selectPlan(id)}
          options={plans.map((p) => ({ value: p.id, label: speedLabel(p.downMbps) }))}
        />
      </div>

      {/* Stage: SVG frame underneath, WebGL crossfades in on top. */}
      <div
        ref={stage}
        className="relative mt-6 h-[240px] overflow-hidden rounded-lg border border-border bg-background/70 sm:h-[320px] lg:h-[380px]"
      >
        <SymmetryPoster
          down={down}
          up={up}
          className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", live && ready ? "opacity-0" : "opacity-100")}
        />
        {live && (
          <div aria-hidden className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
            <SceneBoundary
              onError={() => {
                setFailed(true)
                setMount(false)
              }}
            >
              <SymmetryScene
                down={down}
                up={up}
                quality={mobile ? "mobile" : "desktop"}
                interactive={!mobile}
                onReady={() => setReady(true)}
              />
            </SceneBoundary>
          </div>
        )}
        <p aria-hidden className="pointer-events-none absolute top-3 left-4 flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider text-fiber">
          {t("down")} <ArrowRight className="size-3.5" />
        </p>
        <p
          aria-hidden
          className={cn(
            "pointer-events-none absolute right-4 bottom-3 flex items-center gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider",
            mode === "asym" ? "text-warn" : "text-fiber"
          )}
        >
          <ArrowLeft className="size-3.5" /> {t("up")}
        </p>
        {live && ready && !mobile && (
          <p aria-hidden className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[0.65rem] text-muted-foreground">
            {t("hint")}
          </p>
        )}
        <p className="sr-only">{t("alt", { down: downLabel, up: upLabel })}</p>
      </div>

      {/* Readout: the information the animation shows, as text. */}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
        <div aria-live="polite">
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono tabular-nums">
            <div className="flex items-baseline gap-2">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">↓ {t("down")}</dt>
              <dd className="text-3xl font-semibold text-foreground sm:text-4xl">{downLabel}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">↑ {t("up")}</dt>
              <dd className={cn("text-3xl font-semibold sm:text-4xl", mode === "asym" ? "text-warn" : "text-foreground")}>
                {upLabel}
              </dd>
            </div>
          </dl>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {mode === "fiber" ? t("equal") : t("asymNote", { ratio: ASYM_RATIO })}
            {mode === "asym" && <SimTag kind="demo" />}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ContractButton context="symmetry" planId={plan.id} />
          <a
            href="#plans"
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {t("viewPlans")}
            <ArrowRight className="size-4" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  )
}
