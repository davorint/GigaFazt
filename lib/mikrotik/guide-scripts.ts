/**
 * The ideal guide's router scripts for a deployment, as ordered steps (base, balancing, PPPoE, CGNAT, hardening,
 * operations), each opened by guards that stop with a clear message when what it needs is missing or it's already
 * installed; plus the deployment's download (the guide, then the expert scripts turned on) and the combined undo in
 * reverse order. Shared by /mikrotik-optimo's guide and its "¿Qué tiene este router?" check.
 */
import type { AdvContext, Step } from "./advanced"
import { balanceScript, balanceUndo, checkBalance } from "./balance"
import { bundleModules, moduleSteps, type Module } from "./bundle"
import { clientsOf } from "./deployments"
import { rosString } from "./routeros"
import { checkSetup, oltSetup, setupParts, setupPlans, setupUndo, type SetupContext, type SetupParts } from "./setup"
import type { LabState } from "./state"

export type GuideStepId = "base" | "balance" | "pppoe" | "cgnat" | "hardening" | "ops"

const DS_GUARD = ':if ([:len [/interface list find where name="DS-WAN"]] = 0) do={:error "DS: falta la base del despliegue (paso 1): pegala antes"}'

/** What each guide step checks before running and how to see it worked. */
export const GUIDE_VERIFY: Record<GuideStepId, string> = {
  base: '/interface list print where name~"^DS-"',
  balance: '/ip route print where comment~"^LB: "',
  pppoe: "/interface pppoe-server server print",
  cgnat: '/ip firewall nat print where comment~"^DS: "',
  hardening: '/ip firewall filter print stats where comment~"^DS: "',
  ops: '/system scheduler print where name~"^DS-"',
}

/** Guards that open each guide step. */
export function guideGuards(id: GuideStepId, state: Pick<LabState, "wans">): string[] {
  switch (id) {
    case "base":
      return [':if ([:len [/interface list find where name="DS-WAN"]] > 0) do={:error "DS: la base ya esta en este router: usa el deshacer antes de pegarla otra vez"}']
    case "balance":
      return [
        DS_GUARD,
        ':if ([:len [/routing table find where comment~"^LB: "]] > 0) do={:error "LB: el balanceo ya esta en este router: usa su deshacer antes de pegarlo otra vez"}',
        // Links by DHCP: the routes read the gateway from the lease, so it must be there.
        ...state.wans
          .filter((w) => w.type === "dhcp")
          .map((w) => {
            const i = rosString(w.iface.trim())
            const name = w.iface.trim().replace(/"/g, "")
            return `{:local d [/ip dhcp-client find where interface=${i}]; :if ([:len $d] = 0) do={:error "LB: ${name} no tiene cliente DHCP: agregalo antes"}; :if ([/ip dhcp-client get $d status] != "bound") do={:error "LB: ${name} aun no recibe IP por DHCP: revisa el cable o el carrier"}}`
          }),
      ]
    case "pppoe":
    case "cgnat":
    case "hardening":
    case "ops":
      return [DS_GUARD]
  }
}

export type GuideScripts = {
  ctx: SetupContext
  plans: ReturnType<typeof setupPlans>
  parts: SetupParts | null
  balance: string
  olt: string
  /** The guide's router steps in pasting order; empty when the settings have errors. */
  steps: (Step & { id: GuideStepId })[]
  undo: string
}

export function guideScripts(state: LabState): GuideScripts {
  const s = state.setup
  const b = state.balance
  const wans = state.wans
  const plans = setupPlans(s.plans, s.rule)
  const ctx: SetupContext = {
    clients: clientsOf({ status: state.status, capacity: state.capacity }),
    wanIfaces: wans.map((w) => w.iface),
    balanced: b.clients,
    monitors: b.failover === "recursive" ? wans.map((w) => w.monitor.trim()) : [],
    cgnatUpstreams: wans.filter((w) => w.upstreamCgnat).map((w) => w.iface.trim()),
    pppoeIfaces: wans.filter((w) => w.type === "pppoe").map((w) => w.iface.trim()),
    links: wans,
    queue: state.queueKind,
  }
  const parts = setupParts(s, { ...ctx, name: state.deployment, plans })
  const balance = balanceScript({ ...b, wans })
  const olt = oltSetup(s, { plans })
  const ready = parts !== null && balance !== ""
  const body: [GuideStepId, string][] = ready ? [["base", parts.base], ["balance", balance], ["pppoe", parts.pppoe], ["cgnat", parts.cgnat], ["hardening", parts.hardening], ["ops", parts.ops]] : []
  const steps = body.filter(([, x]) => x.trim()).map(([id, x]) => ({ id, script: [...guideGuards(id, state), x].join("\n"), verify: GUIDE_VERIFY[id] }))
  return { ctx, plans, parts, balance, olt, steps, undo: [balanceUndo(b.speed), setupUndo(s)].join("\n") }
}

/** Whether the guide's settings have errors (then nothing can be downloaded). */
export function guideErrors(state: LabState): boolean {
  const g = guideScripts(state)
  return checkSetup(state.setup, g.ctx).some((i) => i.level === "error") || checkBalance({ ...state.balance, wans: state.wans }).some((i) => i.level === "error")
}

export const advContext = (state: LabState): AdvContext => ({ name: state.deployment, setup: state.setup, wans: state.wans, queue: state.queueKind, failover: state.balance.failover })

export type BundleStep = { group: "guide" | Module; id: string; script: string; verify?: string }

/** The deployment's download: the guide's steps, then each turned-on expert script's steps, and the undo for all of it. */
export function deploymentBundle(state: LabState): { steps: BundleStep[]; skipped: Module[]; undo: string } {
  const g = guideScripts(state)
  if (!g.steps.length) return { steps: [], skipped: [], undo: "" }
  const { included, skipped } = bundleModules(advContext(state), state.advanced)
  const steps: BundleStep[] = [...g.steps.map((x) => ({ group: "guide" as const, ...x })), ...included.flatMap((m) => m.steps.map((x) => ({ group: m.mod, ...x })))]
  // Undo the expert scripts first, in reverse order, then the balancing and the base.
  const undo = [...included.map((m) => m.undo).reverse(), g.undo].filter(Boolean).join("\n")
  return { steps, skipped, undo }
}

export { moduleSteps }
