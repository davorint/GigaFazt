/**
 * The expert scripts as the deployment saved them: their settings merged over the defaults, and their steps for the
 * deployment's download (the ideal guide first, then the expert scripts turned on, in an order that respects what each
 * one needs). Shared by the generators panel and the guide.
 */
import {
  DEFAULT_BACKUP_ROUTER,
  DEFAULT_BGP,
  DEFAULT_BOOST,
  DEFAULT_DNS_FILTER,
  DEFAULT_MONITOR,
  DEFAULT_MOROSOS,
  DEFAULT_REMOTE,
  DEFAULT_SHIELD,
  DEFAULT_USAGE,
  backupRouterScripts,
  bgpScript,
  boostScript,
  dnsFilterScript,
  monitorScript,
  morososScript,
  remoteScript,
  routeScript,
  shieldScript,
  usageScript,
  type AdvContext,
  type RouteRule,
  type Step,
} from "./advanced"
import { DEFAULT_ALERTS, DEFAULT_FAILOVER, DEFAULT_FILTERS, alertsScript, bondScript, defaultProbes, failoverScript, filtersScript, fullExportScript, priorityScript, publicIpScript, type PublicIpRow } from "./advanced2"
import { DEFAULT_CONNTRACK, DEFAULT_POOL, DEFAULT_PORTS, DEFAULT_SESSIONS, conntrackScript, defaultPorts, poolScript, portsScript, sessionsScript, sheetScript } from "./advanced3"
import type { AdvancedState } from "./state"

/** Generators by what they're for (the picker's groups). */
export const GROUPS = {
  enlaces: ["failover", "destinos", "bond", "respaldo", "repuesto"],
  clientes: ["morosos", "velocidad", "uso", "ippublica", "prioridad"],
  seguridad: ["filtros", "escudo", "dns", "acceso"],
  operacion: ["monitoreo", "alertas", "ficha", "sesiones", "pool", "conexiones", "puertos"],
  crecer: ["bgp"],
} as const
export type Module = (typeof GROUPS)[keyof typeof GROUPS][number]
export const MODULES = Object.values(GROUPS).flat() as Module[]

/**
 * Order in the deployment's download: remote access and protection first, then what clients see, what rides on the
 * balancing, operations, and last what changes the network around the router (backup router, OLT bond, BGP).
 */
export const BUNDLE_ORDER: Module[] = ["acceso", "filtros", "escudo", "dns", "morosos", "uso", "velocidad", "ippublica", "destinos", "failover", "prioridad", "monitoreo", "alertas", "ficha", "sesiones", "pool", "conexiones", "puertos", "repuesto", "respaldo", "bond", "bgp"]

/**
 * Saved values over the defaults, field by field: a field is taken only when it has the default's kind (number, text,
 * yes/no, list, record), so an old or edited saved value never breaks the page.
 */
export function merge<T extends object>(def: T, raw: unknown): T {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return def
  const out: Record<string, unknown> = { ...(def as Record<string, unknown>) }
  for (const [k, v] of Object.entries(def as Record<string, unknown>)) {
    const r = (raw as Record<string, unknown>)[k]
    if (r === undefined || r === null) continue
    if (Array.isArray(v) ? Array.isArray(r) : typeof r === typeof v && (typeof v !== "number" || Number.isFinite(r))) out[k] = r
  }
  return out as T
}

export type DestinationsOptions = { rules: RouteRule[] }
export type PublicIpOptions = { rows: PublicIpRow[] }
export type BondPanelOptions = { ports: string; oltPorts: string }

/** Each generator's defaults for this deployment (some depend on it: the links, the OLT port). */
export function defaultsFor(ctx: AdvContext): Record<Module, object> {
  const wan = ctx.wans[0]?.name ?? ""
  return {
    failover: { ...DEFAULT_FAILOVER, probes: defaultProbes(ctx.wans, ctx.wans.map((w) => w.monitor.trim())) },
    destinos: { rules: [{ wan, dest: "" }] } satisfies DestinationsOptions,
    bond: { ports: `${ctx.setup.oltPort.trim()}, `, oltPorts: "0/2/0, 0/3/0" } satisfies BondPanelOptions,
    respaldo: DEFAULT_BACKUP_ROUTER,
    repuesto: {},
    morosos: DEFAULT_MOROSOS,
    velocidad: DEFAULT_BOOST,
    uso: DEFAULT_USAGE,
    ippublica: { rows: [{ user: "", ip: "", wan }] } satisfies PublicIpOptions,
    prioridad: {},
    filtros: DEFAULT_FILTERS,
    escudo: DEFAULT_SHIELD,
    dns: DEFAULT_DNS_FILTER,
    acceso: DEFAULT_REMOTE,
    monitoreo: DEFAULT_MONITOR,
    alertas: DEFAULT_ALERTS,
    ficha: {},
    sesiones: DEFAULT_SESSIONS,
    pool: DEFAULT_POOL,
    conexiones: DEFAULT_CONNTRACK,
    puertos: { ...DEFAULT_PORTS, ports: defaultPorts(ctx) },
    bgp: DEFAULT_BGP,
  }
}

/** A generator's settings for this deployment: saved values over its defaults. */
export function optionsOf<T extends object>(mod: Module, ctx: AdvContext, adv: AdvancedState): T {
  const def = defaultsFor(ctx)[mod] as T
  const merged = merge(def, adv.o[mod])
  // Probes: a link added after saving gets its default second IP.
  if (mod === "failover") {
    const f = merged as unknown as { probes: Record<string, string> }
    f.probes = { ...(def as unknown as { probes: Record<string, string> }).probes, ...f.probes }
  }
  return merged
}

export type ModuleSteps = { steps: Step[]; undo: string; ok: boolean }

/** The steps of one generator for this router, from the saved settings; ok = false when its settings have errors. */
export function moduleSteps(mod: Module, ctx: AdvContext, adv: AdvancedState): ModuleSteps {
  const r = (() => {
    switch (mod) {
      case "morosos":
        return morososScript(ctx, optionsOf(mod, ctx, adv))
      case "acceso":
        return remoteScript(ctx, optionsOf(mod, ctx, adv))
      case "dns":
        return dnsFilterScript(ctx, optionsOf(mod, ctx, adv))
      case "uso":
        return usageScript(ctx, optionsOf(mod, ctx, adv))
      case "escudo":
        return shieldScript(ctx, optionsOf(mod, ctx, adv))
      case "velocidad":
        return boostScript(ctx, optionsOf(mod, ctx, adv))
      case "monitoreo":
        return monitorScript(ctx, optionsOf(mod, ctx, adv))
      case "destinos":
        return routeScript(ctx, optionsOf<DestinationsOptions>(mod, ctx, adv).rules)
      case "bgp":
        return bgpScript(optionsOf(mod, ctx, adv))
      case "failover":
        return failoverScript(ctx, optionsOf(mod, ctx, adv))
      case "filtros":
        return filtersScript(ctx, optionsOf(mod, ctx, adv))
      case "alertas":
        return alertsScript(ctx, optionsOf(mod, ctx, adv))
      case "prioridad":
        return priorityScript(ctx)
      case "ficha":
        return sheetScript(ctx)
      case "sesiones":
        return sessionsScript(ctx, optionsOf(mod, ctx, adv))
      case "pool":
        return poolScript(ctx, optionsOf(mod, ctx, adv))
      case "conexiones":
        return conntrackScript(ctx, optionsOf(mod, ctx, adv))
      case "puertos":
        return portsScript(ctx, optionsOf(mod, ctx, adv))
      case "ippublica":
        return publicIpScript(ctx, optionsOf<PublicIpOptions>(mod, ctx, adv).rows)
      case "repuesto":
        return fullExportScript(ctx)
      case "bond": {
        const b = bondScript(ctx, optionsOf(mod, ctx, adv))
        return { steps: b.steps, undo: b.undo, issues: b.issues, script: b.router }
      }
      case "respaldo": {
        const b = backupRouterScripts(ctx, optionsOf(mod, ctx, adv))
        return { steps: b.mainSteps, undo: b.undoMain, issues: b.issues, script: b.main }
      }
    }
  })()
  return { steps: r.steps, undo: r.undo, ok: !r.issues.some((i) => i.level === "error") && r.steps.length > 0 }
}

/** The turned-on generators in download order, with their steps (those whose settings have errors are left out and listed). */
export function bundleModules(ctx: AdvContext, adv: AdvancedState): { included: { mod: Module; steps: Step[]; undo: string }[]; skipped: Module[] } {
  const included: { mod: Module; steps: Step[]; undo: string }[] = []
  const skipped: Module[] = []
  for (const mod of BUNDLE_ORDER) {
    if (!adv.on.includes(mod)) continue
    const m = moduleSteps(mod, ctx, adv)
    if (m.ok) included.push({ mod, steps: m.steps, undo: m.undo })
    else skipped.push(mod)
  }
  return { included, skipped }
}

/** One step in a downloaded .rsc: a header with its number and title, what to check before, its lines, how to verify. */
export function stepBlock(n: number, title: string, script: string, before?: string, verify?: string): string {
  return [`# ── Paso ${n} · ${title}`, ...(before ? [`# Antes: ${before}`] : []), script, ...(verify ? [`# Comprueba: ${verify}`] : []), ""].join("\n")
}
