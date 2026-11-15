"use client"

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { IslandFrame } from "@/components/layout/IslandFrame"
import { WhenVisible } from "@/components/layout/WhenVisible"
import type { Pattern, PlanRule, QueueParams } from "@/lib/mikrotik/burst"
import type { QueueKind } from "@/lib/mikrotik/routeros"
import {
  decodeState,
  encodeState,
  initialState,
  PRESETS,
  presetState,
  type CapacityState,
  type Direction,
  type GroupState,
  type LabState,
} from "@/lib/mikrotik/state"
import { sameQueue } from "@/lib/mikrotik/import"
import { CopyButton } from "./CopyButton"
import { FiguresPanel } from "./FiguresPanel"
import { ImportPanel } from "./ImportPanel"
import { ParamsPanel } from "./ParamsPanel"
import { SimPanel } from "./SimPanel"
import { SolverPanel } from "./SolverPanel"

// Sections further down load when they get near the screen: smaller first load, no work for panels nobody opens.
const frame = (className: string) =>
  function Loading() {
    return <IslandFrame className={className} />
  }
const ComparePanel = dynamic(() => import("./ComparePanel").then((m) => m.ComparePanel), { ssr: false, loading: frame("min-h-[60rem] sm:min-h-[56rem]") })
const SharedPanel = dynamic(() => import("./SharedPanel").then((m) => m.SharedPanel), { ssr: false, loading: frame("min-h-[110rem] sm:min-h-[100rem]") })
const CapacityPanel = dynamic(() => import("./CapacityPanel").then((m) => m.CapacityPanel), { ssr: false, loading: frame("min-h-[140rem] sm:min-h-[110rem]") })
const ExportPanel = dynamic(() => import("./ExportPanel").then((m) => m.ExportPanel), { ssr: false, loading: frame("min-h-[60rem] sm:min-h-[48rem]") })
const BulkPanel = dynamic(() => import("./BulkPanel").then((m) => m.BulkPanel), { ssr: false, loading: frame("min-h-[100rem] sm:min-h-[70rem]") })

/** Renders `children` once the section is within 800 px of the screen. */
function Lazy({ children, fallback }: { children: ReactNode; fallback: string }) {
  return (
    <WhenVisible rootMargin="800px" fallback={<IslandFrame className={fallback} />}>
      {children}
    </WhenVisible>
  )
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const readHash = () => window.location.hash

const JUMP = ["params", "sim", "compare", "shared", "capacity", "solver", "export", "bulk", "how"] as const
const ANCHORS: Record<(typeof JUMP)[number], string> = {
  params: "parametros",
  sim: "simulacion",
  compare: "comparar",
  shared: "compartida",
  capacity: "hora-pico",
  solver: "calculadora",
  export: "exportar",
  bulk: "varios-clientes",
  how: "como-funciona",
}

/** MikroTik's classic example (Manual:Queue), in Mbps. */
const CLASSIC: QueueParams = { limitAt: 1, maxLimit: 2, burstThreshold: 1.5, burstLimit: 4, burstTime: 16 }

function Section({ id, name, title, lead, children }: { id: string; name: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} data-section={name} className="scroll-mt-16 py-10 sm:py-14">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-2xl font-normal tracking-tight text-foreground sm:text-3xl">{title}</h2>
        {lead && <p className="mt-2 text-sm leading-relaxed text-zinc-400 sm:text-base">{lead}</p>}
      </div>
      {children}
    </section>
  )
}

export function BurstLab() {
  const t = useTranslations("mikrotik")
  const [state, setState] = useState<LabState>(initialState)

  // A shared link carries the configuration in the hash (never sent to the
  // server). Adopt it on load and when it changes, adjusting during render.
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "")
  const [adopted, setAdopted] = useState("")
  if (hash !== adopted) {
    setAdopted(hash)
    const fromHash = decodeState(hash)
    if (fromHash) setState(fromHash)
  }

  const set = (patch: Partial<LabState>) => setState((s) => ({ ...s, ...patch }))
  const setQueue = (dir: Direction, patch: Partial<QueueParams>) =>
    setState((s) => {
      const next = { ...s[dir], ...patch }
      return s.symmetric ? { ...s, preset: "custom", down: next, up: next } : { ...s, preset: "custom", [dir]: next }
    })
  const setPreset = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id)
    setState((s) => (preset ? presetState(preset, s) : { ...s, preset: "custom" }))
  }
  const setSymmetric = (on: boolean) => setState((s) => (on ? { ...s, symmetric: true, up: s.down, view: "down" } : { ...s, symmetric: false }))
  const setPattern = (patch: Partial<Pattern>) => setState((s) => ({ ...s, pattern: { ...s.pattern, ...patch } }))
  const applySolver = (v: { burstThreshold: number; burstTime: number }) => setQueue(state.symmetric ? "down" : state.view, v)
  const applyImport = ({ down, up }: { down: QueueParams; up: QueueParams }) => {
    const symmetric = sameQueue(down, up)
    setState((s) => ({ ...s, preset: "custom", symmetric, down, up: symmetric ? down : up, view: "down" }))
  }
  const setGroup = (group: GroupState) => set({ group })
  const setBackground = (backgroundMbps: number) => set({ backgroundMbps })
  const setQueueKind = (queueKind: QueueKind) => set({ queueKind })
  const setCapacity = (capacity: CapacityState) => set({ capacity })
  // A new rule reloads the current plan with it; custom values stay as they are.
  const setRule = (rule: PlanRule) =>
    setState((s) => {
      const preset = PRESETS.find((p) => p.id === s.preset)
      const next = { ...s, rule }
      return preset ? presetState(preset, next) : next
    })
  const loadClassic = () => {
    setState((s) => ({
      ...s,
      preset: "custom",
      symmetric: true,
      down: CLASSIC,
      up: CLASSIC,
      view: "down",
      pattern: { ...s.pattern, kind: "sustained", demandMbps: null, startS: 2 },
      durationS: 40,
      lineCapMbps: null,
    }))
    document.getElementById("simulacion")?.scrollIntoView({ behavior: "smooth", block: "start" })
  }
  const reset = () => {
    setState(initialState())
    window.history.replaceState(null, "", window.location.pathname)
    setAdopted("")
  }
  const shareUrl = () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeState(state)}`
    window.history.replaceState(null, "", url)
    // Our own write: don't adopt it back over later edits.
    setAdopted(window.location.hash)
    return url
  }

  const navItems = useMemo(() => JUMP.map((k) => ({ id: ANCHORS[k], label: t(`intro.jump.${k}`) })), [t])

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section id="inicio" data-section="mk-intro" className="pt-10 pb-4 sm:pt-16">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">{t("intro.eyebrow")}</p>
          <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-amber-300 uppercase">
            {t("intro.private")}
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t("intro.title")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t("intro.lead")}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <CopyButton getText={shareUrl} label={t("intro.share")} done={t("intro.shared")} size="default" variant="default" />
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw aria-hidden />
            {t("intro.reset")}
          </Button>
        </div>
      </section>

      <SectionNav label={t("intro.navLabel")} items={navItems} />

      <Section id="parametros" name="mk-params" title={t("params.title")} lead={t("params.lead")}>
        <div className="mb-6">
          <ImportPanel onApply={applyImport} />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr] [&>*]:min-w-0">
          <ParamsPanel
            state={state}
            onPreset={setPreset}
            onSymmetric={setSymmetric}
            onQueue={setQueue}
            onLineCap={(v) => set({ lineCapMbps: v })}
            onPlan={(v) => set({ planMbps: v })}
            onRule={setRule}
          />
          <FiguresPanel state={state} onView={(view) => set({ view })} onBackground={setBackground} />
        </div>
      </Section>

      <Section id="simulacion" name="mk-sim" title={t("sim.title")} lead={t("sim.lead")}>
        <SimPanel state={state} onPreset={setPreset} onPattern={setPattern} onDuration={(durationS) => set({ durationS })} onView={(view) => set({ view })} />
      </Section>

      <Section id="comparar" name="mk-compare" title={t("compare.title")} lead={t("compare.lead")}>
        <Lazy fallback="min-h-[60rem] sm:min-h-[56rem]">
          <ComparePanel state={state} />
        </Lazy>
      </Section>

      <Section id="compartida" name="mk-shared" title={t("shared.title")} lead={t("shared.lead")}>
        <Lazy fallback="min-h-[110rem] sm:min-h-[100rem]">
          <SharedPanel state={state} onGroup={setGroup} />
        </Lazy>
      </Section>

      <Section id="hora-pico" name="mk-capacity" title={t("capacity.title")} lead={t("capacity.lead")}>
        <Lazy fallback="min-h-[140rem] sm:min-h-[110rem]">
          <CapacityPanel state={state} onCapacity={setCapacity} />
        </Lazy>
      </Section>

      <Section id="calculadora" name="mk-solver" title={t("solver.title")} lead={t("solver.lead")}>
        <SolverPanel state={state} onApply={applySolver} />
      </Section>

      <Section id="exportar" name="mk-export" title={t("export.title")} lead={t("export.lead")}>
        <Lazy fallback="min-h-[60rem] sm:min-h-[48rem]">
          <ExportPanel state={state} onQueueKind={setQueueKind} />
        </Lazy>
      </Section>

      <Section id="varios-clientes" name="mk-bulk" title={t("bulk.title")} lead={t("bulk.lead")}>
        <Lazy fallback="min-h-[100rem] sm:min-h-[70rem]">
          <BulkPanel state={state} />
        </Lazy>
      </Section>

      <Section id="como-funciona" name="mk-how" title={t("how.title")}>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] [&>*]:min-w-0">
          <ol className="surface grid content-start gap-5 rounded-2xl p-5 sm:p-7">
            {(t.raw("how.points") as string[]).map((point, i) => (
              <li key={i} className="flex gap-4 text-sm leading-relaxed text-zinc-200 sm:text-base">
                <span aria-hidden className="font-mono text-xs leading-6 text-zinc-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ol>
          <div className="grid content-start gap-6">
            <div className="surface grid gap-3 rounded-2xl p-5 sm:p-7">
              <h3 className="text-sm font-medium text-foreground">{t("how.exampleTitle")}</h3>
              <p className="text-sm leading-relaxed text-zinc-300">{t("how.example")}</p>
              <div>
                <Button type="button" variant="outline" onClick={loadClassic}>
                  {t("how.loadExample")}
                </Button>
              </div>
            </div>
            <div className="grid gap-2 rounded-2xl border border-white/10 p-5 sm:p-7">
              <h3 className="text-sm font-medium text-foreground">{t("how.modelTitle")}</h3>
              <p className="text-sm leading-relaxed text-zinc-400">{t("how.model")}</p>
            </div>
          </div>
        </div>
      </Section>
    </main>
  )
}

/**
 * Section menu that stays at the top while scrolling (one row, scrolls
 * sideways on phones) and marks the section on screen.
 */
function SectionNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null)
    // The section crossing the middle of the screen is the current one.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: "-45% 0px -50% 0px" }
    )
    sections.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [items])

  // Keep the current link visible in the scrolling row.
  useEffect(() => {
    if (!active) return
    document.querySelector(`[data-nav-link="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  return (
    // Static in screenshot captures (html[data-shot]) so it doesn't cover the section being shot.
    <nav
      aria-label={label}
      className="sticky top-0 z-30 -mx-4 border-b border-white/10 bg-background/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 [html[data-shot]_&]:static"
    >
      <ul className="flex gap-1 overflow-x-auto py-2 text-sm [scrollbar-width:none]">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              data-nav-link={i.id}
              aria-current={active === i.id ? "location" : undefined}
              className="block rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:text-foreground aria-[current=location]:bg-white/10 aria-[current=location]:text-foreground"
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
