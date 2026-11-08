"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { cn } from "cn"
import { SimTag } from "@/components/hud/SimTag"
import { ContractButton } from "@/components/conversion/ContractButton"
import { getPlan, plans } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { selection, useSelection } from "@/lib/selection"
import { useReducedMotion } from "@/lib/motion"
import { SceneBoundary, canUseWebGL } from "./SceneBoundary"
import { SymmetryPoster } from "./SymmetryPoster"
import type { Progress, StreamTarget } from "./SymmetryScene"

// three.js only loads through this dynamic import, never in the initial bundle.
const SymmetryScene = dynamic(() => import("./SymmetryScene").then((m) => m.SymmetryScene), { ssr: false })

type Mode = "fiber" | "asym"

const CYAN = "#22d3ee"
const VIOLET = "#a78bfa"
/** Illustrative asymmetric ratio (download ÷ upload), labelled as an example. */
const ASYM_RATIO = 10
const MAX_MBPS = Math.max(...plans.map((p) => p.downMbps))

function targets(downMbps: number, mode: Mode): { down: StreamTarget; up: StreamTarget; upMbps: number } {
  const frac = downMbps / MAX_MBPS
  const down: StreamTarget = { active: 0.4 + 0.6 * frac, speed: 5 + 11 * frac, color: CYAN, radius: 1, gain: 1 }
  if (mode === "fiber") return { down, up: { ...down, color: VIOLET }, upMbps: downMbps }
  return {
    down,
    // The upload braid collapses into a thin thread along the core wall.
    up: { active: Math.max(0.1, down.active / ASYM_RATIO), speed: down.speed * 0.3, color: VIOLET, radius: 0.08, gain: 1.3, shift: 1 },
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
 * "Dentro de la fibra" (owner redesign, 2026-11-07; replaced the speed test and
 * the first "Simetría en luz"): a full-bleed three.js flight into the core of a
 * fiber. Scrolling in flies the camera from outside the strand into the core;
 * the cursor looks around inside. The plan picker drives the site-wide plan.
 * Reduced motion / paused animations → one still WebGL frame; no WebGL → SVG.
 */
export function SymmetryLight() {
  const t = useTranslations("fiber.symmetry")
  const planId = useSelection((s) => s.planId)
  const plan = getPlan(planId) ?? plans[plans.length - 1]
  const [mode, setMode] = useState<Mode>("fiber")
  const { down, up, upMbps } = useMemo(() => targets(plan.downMbps, mode), [plan.downMbps, mode])

  const stage = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLSpanElement>(null)
  const progress = useRef<Progress>({ value: 0 })
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

  // Scroll progress, read by the scene every frame (no re-renders).
  // Story mode (desktop, motion allowed; CSS .fiber-story makes the wrapper
  // tall and pins the stage): the camera flies in from the moment the stage
  // enters until halfway through the pin, and the pin is split into three
  // chapters (data-chapter on the wrapper, crossfaded by CSS). Otherwise:
  // 0 while the stage's top is at the bottom of the viewport, 1 at the top.
  useEffect(() => {
    const el = stage.current
    const box = wrap.current
    if (!el || !box) return
    let raf = 0
    let chapter = -1
    const update = () => {
      raf = 0
      const vh = window.innerHeight || 1
      const pin = box.offsetHeight - el.offsetHeight
      const clamp = (v: number) => Math.min(1, Math.max(0, v))
      if (pin > 40) {
        const top = box.getBoundingClientRect().top
        const q = clamp(-top / pin)
        progress.current.value = clamp((vh - top) / (vh + pin * 0.5))
        const c = q < 1 / 3 ? 0 : q < 2 / 3 ? 1 : 2
        if (c !== chapter) {
          chapter = c
          box.dataset.chapter = String(c)
        }
        if (bar.current) bar.current.style.transform = `scaleX(${q})`
      } else {
        const r = el.getBoundingClientRect()
        progress.current.value = clamp(1 - r.top / (vh * 0.85))
      }
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Mount the scene only near the viewport (one live WebGL context per region);
  // drop it when scrolled away.
  useEffect(() => {
    const el = stage.current
    if (failed || !el || !canUseWebGL()) return
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
      { rootMargin: "300px" }
    )
    io.observe(el)
    return () => {
      io.disconnect()
      if (idle !== undefined) cancel(idle)
      setMount(false)
      setReady(false)
    }
  }, [failed])

  const live = mount && !failed
  const downLabel = speedLabel(plan.downMbps)
  const upLabel = speedLabel(upMbps)

  return (
    <div ref={wrap} data-chapter="0" className="fiber-story relative">
      <div className="fiber-story-pin">
      {/* Stage: full-bleed. SVG frame underneath, WebGL crossfades in on top. */}
      <div
        ref={stage}
        className="relative h-[72svh] min-h-[460px] overflow-hidden bg-[#010409] md:h-[100svh] md:max-h-[960px] md:min-h-[640px]"
      >
        <SymmetryPoster
          down={down}
          up={up}
          className={cn("absolute inset-0 h-full w-full transition-opacity duration-1000", live && ready ? "opacity-0" : "opacity-100")}
        />
        {live && (
          <div aria-hidden className={cn("absolute inset-0 transition-opacity duration-1000", ready ? "opacity-100" : "opacity-0")}>
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
                interactive={!mobile && !reduced}
                still={reduced}
                progress={progress}
                onReady={() => setReady(true)}
              />
            </SceneBoundary>
          </div>
        )}

        {/* Legibility gradients that also blend the stage into the page. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-background via-background/60 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background via-background/70 to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 top-0">
          <div className="mx-auto flex max-w-7xl flex-wrap items-start justify-between gap-4 px-4 pt-8 sm:px-6 sm:pt-10 md:pt-24">
            <div className="max-w-xl">
              <h3 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">{t("title")}</h3>
              <p className="fiber-story-hide mt-2 text-sm text-muted-foreground sm:text-base">{t("desc")}</p>
            </div>
            <ul aria-hidden className="flex flex-col gap-1.5 font-mono text-[0.65rem] uppercase tracking-wider">
              <li className="flex items-center gap-2 text-[#67e8f9]">
                <span className="size-2 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]" />
                {t("down")} · {t("downTo")}
              </li>
              <li className="flex items-center gap-2 text-[#c4b5fd]">
                <span className="size-2 rounded-full bg-[#a78bfa] shadow-[0_0_10px_#a78bfa]" />
                {t("up")} · {t("upTo")}
              </li>
            </ul>
          </div>
        </div>

        {/* Story chapters (desktop, motion allowed): one at a time while pinned. */}
        <div aria-hidden className="fiber-story-only pointer-events-none absolute inset-0 bg-[radial-gradient(42%_48%_at_18%_46%,rgb(2_4_9/0.82),rgb(2_4_9/0.45)_55%,transparent_80%)]" />
        <div className="fiber-story-only pointer-events-none absolute inset-x-0 top-1/2 -translate-y-[70%]">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <ol className="relative max-w-md">
              {(["c1", "c2", "c3"] as const).map((k, i) => (
                <li key={k} data-step={i} className="fiber-chapter">
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    0{i + 1} <span className="opacity-50">/ 03</span>
                  </p>
                  <p className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] text-white lg:text-4xl">{t(`story.${k}.title`)}</p>
                  <p className="mt-3 text-base leading-relaxed text-foreground/70">{t(`story.${k}.body`)}</p>
                </li>
              ))}
            </ol>
            <span aria-hidden className="mt-6 block h-px w-40 bg-white/10">
              <span ref={bar} className="block h-full origin-left scale-x-0 bg-white/70" />
            </span>
          </div>
        </div>

        <p className="sr-only">{t("alt", { down: downLabel, up: upLabel })}</p>
      </div>

      {/* HUD: below the stage on phones, overlaid as glass on larger screens. */}
      <div className="relative md:absolute md:inset-x-0 md:bottom-0">
        <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 md:pb-8">
          <div className="rounded-xl border border-border bg-background/75 p-4 backdrop-blur-md sm:p-5">
            <p aria-hidden className="mb-4 border-b border-border pb-3 font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {t("physics")}
              {live && ready && !mobile && !reduced && <span className="text-fiber"> · {t("hint")}</span>}
            </p>
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
              <div className="flex flex-wrap gap-x-6 gap-y-4">
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

              <div aria-live="polite">
                <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-2 font-mono tabular-nums">
                  <div className="flex items-baseline gap-2">
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      <span aria-hidden className="size-1.5 rounded-full bg-[#22d3ee]" />↓ {t("down")}
                    </dt>
                    <dd className="text-2xl font-semibold text-foreground sm:text-3xl">{downLabel}</dd>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      <span aria-hidden className="size-1.5 rounded-full bg-[#a78bfa]" />↑ {t("up")}
                    </dt>
                    <dd className={cn("text-2xl font-semibold sm:text-3xl", mode === "asym" ? "text-warn" : "text-foreground")}>
                      {upLabel}
                    </dd>
                  </div>
                </dl>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                  {mode === "fiber" ? t("equal") : t("asymNote", { ratio: ASYM_RATIO })}
                  {mode === "asym" && <SimTag kind="demo" />}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <ContractButton context="symmetry" planId={plan.id} />
                <a
                  href="#plans"
                  className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t("viewPlans")}
                  <ArrowRight className="size-4" aria-hidden />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
