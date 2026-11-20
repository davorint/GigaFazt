"use client"

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { RotateCcw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { IslandFrame } from "@/components/layout/IslandFrame"
import { WhenVisible } from "@/components/layout/WhenVisible"
import type { Wan } from "@/lib/mikrotik/balance"
import type { Pattern, PlanRule, QueueParams } from "@/lib/mikrotik/burst"
import { averageOf, newId, type SavedDeployment } from "@/lib/mikrotik/deployments"
import {
  importDeployments,
  putDeployment,
  readDeployments,
  removeDeployment,
  serverDeployments,
  setLastOpen,
  subscribeDeployments,
} from "@/lib/mikrotik/deployment-store"
import type { QueueKind } from "@/lib/mikrotik/routeros"
import type { SetupState } from "@/lib/mikrotik/setup"
import {
  decodeDeployment,
  decodeState,
  deploymentFields,
  encodeDeployment,
  encodeState,
  initialState,
  MAX_NAME,
  PRESETS,
  presetState,
  type AdvancedState,
  type BalanceState,
  type DeploymentFields,
  type DeploymentStatus,
  type CapacityState,
  type Direction,
  type GroupState,
  type LabState,
} from "@/lib/mikrotik/state"
import { sameQueue } from "@/lib/mikrotik/import"
import { CopyButton } from "./CopyButton"
import { SectionNav } from "./SectionNav"
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
const CapacityPanel = dynamic(() => import("./CapacityPanel").then((m) => m.CapacityPanel), { ssr: false, loading: frame("min-h-[160rem] sm:min-h-[130rem]") })
const DeploymentsPanel = dynamic(() => import("./DeploymentsPanel").then((m) => m.DeploymentsPanel), { ssr: false, loading: frame("min-h-[40rem] sm:min-h-[32rem]") })
const GuidePanel = dynamic(() => import("./GuidePanel").then((m) => m.GuidePanel), { ssr: false, loading: frame("min-h-[90rem] sm:min-h-[70rem]") })
const SetupPanel = dynamic(() => import("./SetupPanel").then((m) => m.SetupPanel), { ssr: false, loading: frame("min-h-[110rem] sm:min-h-[80rem]") })
const BalancePanel = dynamic(() => import("./BalancePanel").then((m) => m.BalancePanel), { ssr: false, loading: frame("min-h-[120rem] sm:min-h-[90rem]") })
const ExportPanel = dynamic(() => import("./ExportPanel").then((m) => m.ExportPanel), { ssr: false, loading: frame("min-h-[60rem] sm:min-h-[48rem]") })
const AdvancedPanel = dynamic(() => import("./AdvancedPanel").then((m) => m.AdvancedPanel), { ssr: false, loading: frame("min-h-[90rem] sm:min-h-[70rem]") })
const InstalledPanel = dynamic(() => import("./InstalledPanel").then((m) => m.InstalledPanel), { ssr: false, loading: frame("min-h-[30rem] sm:min-h-[24rem]") })
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

type Jump = "params" | "sim" | "compare" | "shared" | "deployments" | "guide" | "installed" | "capacity" | "links" | "setup" | "advanced" | "solver" | "export" | "bulk" | "how"

/**
 * The internal pages: /interno/equipos-telecom/guia-mikrotik is the ideal guide for a deployment (owner, 2026-11-16), /interno/equipos-telecom/scripts-mikrotik the expert
 * scripts and full editors, /interno/equipos-telecom/calculadora the calculators and simulators (owner, 2026-11-15).
 */
export type LabPage = "guide" | "scripts" | "calculators"
const PAGE_SECTIONS: Record<LabPage, Jump[]> = {
  guide: ["deployments", "guide", "installed"],
  scripts: ["params", "deployments", "links", "setup", "advanced", "export", "bulk"],
  calculators: ["params", "sim", "compare", "shared", "deployments", "capacity", "solver", "how"],
}
/** Each page's entry in the internal menu (components/interno/AdminLinks.tsx). */
const PAGE_KEY = { guide: "equipos-telecom", scripts: "equipos-telecom", calculators: "equipos-telecom" } as const satisfies Record<LabPage, string>
const ANCHORS: Record<Jump, string> = {
  params: "parametros",
  sim: "simulacion",
  compare: "comparar",
  shared: "compartida",
  deployments: "despliegues",
  guide: "guia",
  installed: "verificar",
  capacity: "hora-pico",
  links: "enlaces",
  setup: "configuracion",
  advanced: "avanzados",
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

export function BurstLab({ page }: { page: LabPage }) {
  const t = useTranslations("mikrotik")
  const on = (k: Jump) => PAGE_SECTIONS[page].includes(k)
  const [state, setState] = useState<LabState>(initialState)
  // The saved deployment the page is working on (its edits are saved as they happen); null = not saved.
  const [boundId, setBoundId] = useState<string | null>(null)
  const saved = useSyncExternalStore(subscribeDeployments, readDeployments, serverDeployments)

  // A shared link carries the configuration in the hash (never sent to the
  // server). Adopt it on load and when it changes, adjusting during render.
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "")
  const [adopted, setAdopted] = useState("")
  if (hash !== adopted) {
    setAdopted(hash)
    const fromHash = decodeState(hash)
    if (fromHash) {
      setState(fromHash)
      setBoundId(null)
    }
  }

  // Without a shared link, open the deployment used last (once, when the browser's list is read).
  const [restored, setRestored] = useState(false)
  if (!restored && saved.loaded) {
    setRestored(true)
    const last = saved.list.find((d) => d.id === saved.lastOpen)
    const fields = last ? decodeDeployment(last.data) : null
    if (last && fields && !decodeState(window.location.hash)) {
      setState((s) => ({ ...s, ...fields }))
      setBoundId(last.id)
    }
  }

  // The open deployment saves itself on every change.
  const deploymentData = useMemo(
    () => encodeDeployment({ deployment: state.deployment, status: state.status, capacity: state.capacity, wans: state.wans, balance: state.balance, setup: state.setup, advanced: state.advanced }),
    [state.deployment, state.status, state.capacity, state.wans, state.balance, state.setup, state.advanced]
  )
  // Another tab (the guide page and the scripts page open side by side) changed the open deployment: take its version,
  // so this tab neither shows old values nor saves them over the newer ones.
  const [seenExternal, setSeenExternal] = useState(saved.external)
  if (saved.external !== seenExternal) {
    setSeenExternal(saved.external)
    const stored = boundId ? saved.list.find((d) => d.id === boundId)?.data : undefined
    const fields = stored && stored !== deploymentData ? decodeDeployment(stored) : null
    if (fields) setState((s) => ({ ...s, ...fields }))
  }
  useEffect(() => {
    if (!boundId) return
    putDeployment(boundId, deploymentData)
    setLastOpen(boundId)
  }, [boundId, deploymentData])

  const openFields = (id: string, fields: DeploymentFields) => {
    setState((s) => ({ ...s, ...fields }))
    setBoundId(id)
  }
  const deployments = {
    open: (id: string) => {
      const fields = decodeDeployment(saved.list.find((d) => d.id === id)?.data ?? "")
      if (fields) openFields(id, fields)
    },
    saveNew: () => {
      const id = newId()
      putDeployment(id, deploymentData)
      setBoundId(id)
    },
    create: (name: string) => {
      const id = newId()
      const fields: DeploymentFields = { ...deploymentFields(initialState()), deployment: name.slice(0, MAX_NAME), status: "planned" }
      putDeployment(id, encodeDeployment(fields))
      openFields(id, fields)
    },
    duplicate: (id: string, name: string) => {
      const fields = decodeDeployment(saved.list.find((d) => d.id === id)?.data ?? "")
      if (!fields) return
      const copy = { ...fields, deployment: name.slice(0, MAX_NAME) }
      const next = newId()
      putDeployment(next, encodeDeployment(copy))
      openFields(next, copy)
    },
    remove: (id: string) => {
      removeDeployment(id)
      if (boundId === id) setBoundId(null)
    },
    importItems: (items: SavedDeployment[]) => importDeployments(items),
  }

  // Averages measured on the other saved deployments that already run, for planning new ones.
  const measuredAverages = useMemo(
    () =>
      saved.list.flatMap((d) => {
        if (d.id === boundId) return []
        const f = decodeDeployment(d.data)
        if (!f || f.status !== "existing") return []
        const down = averageOf(f, "down")
        const up = averageOf(f, "up")
        return down.measured || up.measured ? [{ id: d.id, name: f.deployment, down: down.measured ? down.mbps : null, up: up.measured ? up.mbps : null }] : []
      }),
    [saved.list, boundId]
  )

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
  const setDeployment = (deployment: string) => set({ deployment })
  const setStatus = (status: DeploymentStatus) => set({ status })
  const setWans = (wans: Wan[]) => set({ wans })
  const setBalance = (balance: BalanceState) => set({ balance })
  const setSetup = (setup: SetupState) => set({ setup })
  const setAdvanced = (advanced: AdvancedState) => set({ advanced })
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
    setBoundId(null)
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

  const navItems = useMemo(() => PAGE_SECTIONS[page].map((k) => ({ id: ANCHORS[k], label: t(`intro.jump.${k}`) })), [t, page])

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section id="inicio" data-section="mk-intro" className="pt-10 pb-4 sm:pt-16">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">{t("intro.eyebrow")}</p>
          <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-amber-300 uppercase">
            {t("intro.private")}
          </span>
        </div>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t(`intro.title.${page}`)}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t(`intro.lead.${page}`)}</p>
        <AdminLinks current={PAGE_KEY[page]} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <CopyButton getText={shareUrl} label={t("intro.share")} done={t("intro.shared")} size="default" variant="default" />
          <Button type="button" variant="outline" onClick={reset}>
            <RotateCcw aria-hidden />
            {t("intro.reset")}
          </Button>
        </div>
      </section>

      <SectionNav label={t("intro.navLabel")} items={navItems} />

      {on("params") && (
      <Section id="parametros" name="mk-params" title={t("params.title")} lead={t("params.lead")}>
        <div className="mb-6">
          <ImportPanel onApply={applyImport} />
        </div>
        <div className={`grid items-start gap-6 [&>*]:min-w-0 ${page === "calculators" ? "lg:grid-cols-[1.25fr_1fr]" : ""}`}>
          <ParamsPanel
            state={state}
            onPreset={setPreset}
            onSymmetric={setSymmetric}
            onQueue={setQueue}
            onLineCap={(v) => set({ lineCapMbps: v })}
            onPlan={(v) => set({ planMbps: v })}
            onRule={setRule}
          />
          {page === "calculators" && <FiguresPanel state={state} onView={(view) => set({ view })} onBackground={setBackground} />}
        </div>
      </Section>
      )}

      {on("sim") && (
        <Section id="simulacion" name="mk-sim" title={t("sim.title")} lead={t("sim.lead")}>
          <SimPanel state={state} onPreset={setPreset} onPattern={setPattern} onDuration={(durationS) => set({ durationS })} onView={(view) => set({ view })} />
        </Section>
      )}

      {on("compare") && (
        <Section id="comparar" name="mk-compare" title={t("compare.title")} lead={t("compare.lead")}>
          <Lazy fallback="min-h-[60rem] sm:min-h-[56rem]">
            <ComparePanel state={state} />
          </Lazy>
        </Section>
      )}

      {on("shared") && (
        <Section id="compartida" name="mk-shared" title={t("shared.title")} lead={t("shared.lead")}>
          <Lazy fallback="min-h-[110rem] sm:min-h-[100rem]">
            <SharedPanel state={state} onGroup={setGroup} />
          </Lazy>
        </Section>
      )}

      {on("deployments") && (
        <Section id="despliegues" name="mk-deployments" title={t("deployments.title")} lead={t("deployments.lead")}>
          <Lazy fallback="min-h-[40rem] sm:min-h-[32rem]">
            <DeploymentsPanel state={state} saved={saved} boundId={boundId} actions={deployments} onName={setDeployment} />
          </Lazy>
        </Section>
      )}

      {on("guide") && (
        <Section id="guia" name="mk-guide" title={t("guide.title")} lead={t("guide.lead")}>
          <Lazy fallback="min-h-[90rem] sm:min-h-[70rem]">
            <GuidePanel
              state={state}
              boundId={boundId}
              saved={saved}
              actions={deployments}
              onWans={setWans}
              onBalance={setBalance}
              onSetup={setSetup}
              onName={setDeployment}
            />
          </Lazy>
        </Section>
      )}

      {on("installed") && (
        <Section id="verificar" name="mk-installed" title={t("installed.title")} lead={t("installed.lead")}>
          <Lazy fallback="min-h-[30rem] sm:min-h-[24rem]">
            <InstalledPanel state={state} />
          </Lazy>
        </Section>
      )}

      {on("capacity") && (
        <Section id="hora-pico" name="mk-capacity" title={t("capacity.title")} lead={t("capacity.lead")}>
          <Lazy fallback="min-h-[160rem] sm:min-h-[130rem]">
            <CapacityPanel
              state={state}
              onCapacity={setCapacity}
              onStatus={setStatus}
              measuredAverages={measuredAverages}
            />
          </Lazy>
        </Section>
      )}

      {on("links") && (
        <Section id="enlaces" name="mk-links" title={t("links.title")} lead={t("links.lead")}>
          <Lazy fallback="min-h-[120rem] sm:min-h-[90rem]">
            <BalancePanel state={state} onWans={setWans} onBalance={setBalance} />
          </Lazy>
        </Section>
      )}

      {on("setup") && (
        <Section id="configuracion" name="mk-setup" title={t("config.title")} lead={t("config.lead")}>
          <Lazy fallback="min-h-[110rem] sm:min-h-[80rem]">
            <SetupPanel state={state} onSetup={setSetup} onWans={setWans} />
          </Lazy>
        </Section>
      )}

      {on("advanced") && (
        <Section id="avanzados" name="mk-advanced" title={t("advanced.title")} lead={t("advanced.lead")}>
          <Lazy fallback="min-h-[90rem] sm:min-h-[70rem]">
            <AdvancedPanel state={state} onAdvanced={setAdvanced} />
          </Lazy>
        </Section>
      )}

      {on("solver") && (
        <Section id="calculadora" name="mk-solver" title={t("solver.title")} lead={t("solver.lead")}>
          <SolverPanel state={state} onApply={applySolver} />
        </Section>
      )}

      {on("export") && (
        <Section id="exportar" name="mk-export" title={t("export.title")} lead={t("export.lead")}>
          <Lazy fallback="min-h-[60rem] sm:min-h-[48rem]">
            <ExportPanel state={state} onQueueKind={setQueueKind} />
          </Lazy>
        </Section>
      )}

      {on("bulk") && (
        <Section id="varios-clientes" name="mk-bulk" title={t("bulk.title")} lead={t("bulk.lead")}>
          <Lazy fallback="min-h-[100rem] sm:min-h-[70rem]">
            <BulkPanel state={state} />
          </Lazy>
        </Section>
      )}

      {on("how") && (
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
      )}
    </main>
  )
}
