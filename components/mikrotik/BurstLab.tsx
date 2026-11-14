"use client"

import { useState, useSyncExternalStore, type ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import type { Pattern, QueueParams } from "@/lib/mikrotik/burst"
import {
  decodeState,
  encodeState,
  initialState,
  PRESETS,
  presetState,
  type Direction,
  type LabState,
} from "@/lib/mikrotik/state"
import { CopyButton } from "./CopyButton"
import { ExportPanel } from "./ExportPanel"
import { FiguresPanel } from "./FiguresPanel"
import { ParamsPanel } from "./ParamsPanel"
import { SimPanel } from "./SimPanel"
import { SolverPanel } from "./SolverPanel"

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb)
  return () => window.removeEventListener("hashchange", cb)
}
const readHash = () => window.location.hash

/** MikroTik's classic example (Manual:Queue), in Mbps. */
const CLASSIC: QueueParams = { limitAt: 1, maxLimit: 2, burstThreshold: 1.5, burstLimit: 4, burstTime: 16 }

function Section({ id, name, title, lead, children }: { id: string; name: string; title: string; lead?: string; children: ReactNode }) {
  return (
    <section id={id} data-section={name} className="scroll-mt-6 py-10 sm:py-14">
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

  const jump = ["params", "sim", "solver", "export", "how"] as const
  const anchors: Record<(typeof jump)[number], string> = {
    params: "parametros",
    sim: "simulacion",
    solver: "calculadora",
    export: "exportar",
    how: "como-funciona",
  }

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
        <nav aria-label={t("intro.title")} className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-sm">
          {jump.map((k) => (
            <a key={k} href={`#${anchors[k]}`} className="text-zinc-400 transition-colors hover:text-foreground">
              {t(`intro.jump.${k}`)}
            </a>
          ))}
        </nav>
      </section>

      <Section id="parametros" name="mk-params" title={t("params.title")} lead={t("params.lead")}>
        <div className="grid items-start gap-6 lg:grid-cols-[1.25fr_1fr] [&>*]:min-w-0">
          <ParamsPanel
            state={state}
            onPreset={setPreset}
            onSymmetric={setSymmetric}
            onQueue={setQueue}
            onLineCap={(v) => set({ lineCapMbps: v })}
          />
          <FiguresPanel state={state} onView={(view) => set({ view })} />
        </div>
      </Section>

      <Section id="simulacion" name="mk-sim" title={t("sim.title")} lead={t("sim.lead")}>
        <SimPanel state={state} onPattern={setPattern} onDuration={(durationS) => set({ durationS })} onView={(view) => set({ view })} />
      </Section>

      <Section id="calculadora" name="mk-solver" title={t("solver.title")} lead={t("solver.lead")}>
        <SolverPanel state={state} onApply={applySolver} />
      </Section>

      <Section id="exportar" name="mk-export" title={t("export.title")} lead={t("export.lead")}>
        <ExportPanel state={state} />
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
