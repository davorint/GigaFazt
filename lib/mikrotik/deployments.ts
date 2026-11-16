/**
 * The owner's deployments (one OLT and one router with its own internet
 * providers each, 2026-11-15): the ones that already run, with what was
 * measured on them, and the ones being planned. Pure helpers: what the
 * model takes from a deployment, a quick summary for the comparison table,
 * and the backup file. Storage lives in deployment-store.ts.
 */

import { checkBalance, usableSpeed } from "./balance"
import { checkOlt, OLT_SPECS, portsNeeded } from "./olt"
import { decodeDeployment, type DeploymentFields, type Direction } from "./state"

type Fields = Pick<DeploymentFields, "status" | "capacity">

export const clientsOf = (f: Fields) => f.capacity.clients.reduce((a, b) => a + b, 0)

/** Clients per PON port the model uses: spread over the ports in use when the deployment already runs and they're set. */
export function homesPerPortOf(f: Fields): number {
  const n = clientsOf(f)
  const ports = f.status === "existing" ? f.capacity.portsInUse : null
  return ports && n > 0 ? Math.max(1, Math.ceil(n / ports)) : f.capacity.homesPerPort
}

/** PON ports in use: the ones entered for a deployment that already runs, or what the clients need. */
export function portsOf(f: Fields): number {
  const ports = f.status === "existing" ? f.capacity.portsInUse : null
  return ports ?? portsNeeded(clientsOf(f), f.capacity.homesPerPort)
}

/**
 * Busy-hour average per client: what was measured on the router ÷ the
 * clients when the deployment already runs and it was measured, otherwise
 * the input.
 */
export function averageOf(f: Fields, direction: Direction): { mbps: number; measured: boolean } {
  const c = f.capacity
  const n = clientsOf(f)
  const measured = direction === "down" ? c.measuredDownMbps : c.measuredUpMbps
  if (f.status === "existing" && measured !== null && n > 0) return { mbps: measured / n, measured: true }
  return { mbps: direction === "down" ? c.avgDownMbps : c.avgUpMbps, measured: false }
}

export type DeploymentSummary = {
  clients: number
  /** Download average per client and whether it comes from a measurement. */
  avgMbps: number
  measured: boolean
  /** Clients × average: what they ask on average at the busy hour, Mbps. */
  offeredMbps: number
  /** Internet capacity: the links added up, or the one uplink. */
  internetMbps: number
  /** Number of links, or null with one uplink. */
  links: number | null
  /** PON ports in use and the most the OLT model takes for that PON type (null = unknown or no PON). */
  ports: number
  maxPorts: number | null
  /** Average demand ÷ the OLT's uplink; null without a limit or without PON. */
  oltLoad: number | null
  /** Errors and warnings from the OLT and link checks. */
  problems: number
}

/** Averages only (no simulation): enough to compare deployments side by side. */
export function summarize(f: DeploymentFields): DeploymentSummary {
  const c = f.capacity
  const clients = clientsOf(f)
  const avg = averageOf(f, "down")
  const offeredMbps = clients * avg.mbps
  const links = c.internet === "links" ? f.wans.length : null
  const internetMbps = links !== null ? f.wans.reduce((a, w) => a + Math.max(0, usableSpeed(w, "down", f.balance.queues)), 0) : c.parentMbps
  const pon = c.pon !== "none"
  const ports = pon ? portsOf(f) : 0
  const oltIssues =
    c.pon === "none" ? [] : checkOlt({ model: c.oltModel, tech: c.pon, homesPerPort: homesPerPortOf(f), uplinkMbps: c.oltUplinkMbps, builtPorts: c.oltBuild?.ports[c.pon] }, clients, f.status === "existing" ? (c.portsInUse ?? undefined) : undefined)
  const linkIssues = links !== null ? checkBalance({ ...f.balance, wans: f.wans }) : []
  return {
    clients,
    avgMbps: avg.mbps,
    measured: avg.measured,
    offeredMbps,
    internetMbps,
    links,
    ports,
    maxPorts: c.pon === "none" ? null : OLT_SPECS[c.oltModel].maxPorts[c.pon],
    oltLoad: pon && c.oltUplinkMbps > 0 ? offeredMbps / c.oltUplinkMbps : null,
    problems: [...oltIssues, ...linkIssues].filter((i) => i.level !== "info").length,
  }
}

// ── Saved deployments ─────────────────────────────────────────────────────

/** One saved deployment: its fields as share-link text (same checks when read back). */
export type SavedDeployment = { id: string; updatedAt: number; data: string }

export const MAX_SAVED = 200
const MAX_DATA = 20_000
export const FILE_APP = "gigafazt-mikrotik-despliegues"

export const isSaved = (v: unknown): v is SavedDeployment => {
  const d = v as SavedDeployment
  return (
    !!d &&
    typeof d.id === "string" &&
    d.id.length > 0 &&
    d.id.length <= 64 &&
    typeof d.updatedAt === "number" &&
    Number.isFinite(d.updatedAt) &&
    typeof d.data === "string" &&
    d.data.length <= MAX_DATA
  )
}

/** The backup file (JSON). */
export function exportFile(list: SavedDeployment[], now = new Date()): string {
  return JSON.stringify({ app: FILE_APP, version: 1, exportedAt: now.toISOString(), deployments: list }, null, 2) + "\n"
}

/** Deployments in a backup file; null when it isn't one of ours. Entries that don't read back are skipped. */
export function parseFile(text: string): SavedDeployment[] | null {
  let v: unknown
  try {
    v = JSON.parse(text)
  } catch {
    return null
  }
  const file = v as { app?: unknown; version?: unknown; deployments?: unknown }
  if (!file || file.app !== FILE_APP || file.version !== 1 || !Array.isArray(file.deployments)) return null
  return file.deployments.filter((d): d is SavedDeployment => isSaved(d) && decodeDeployment(d.data) !== null).slice(0, MAX_SAVED)
}

/** A new id for a saved deployment. */
export function newId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === "function") return c.randomUUID()
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
