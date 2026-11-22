/**
 * Network inventory (WispDavor phase 8, owner 2026-11-22: "do them all"): every ONT on the clients' internet services
 * (model, serial, OLT port, ONT ID, light from the OLT readings pasted in Clientes, lib/clients/optics.ts), grouped by
 * OLT port, with what needs attention: the same serial or the same port + ONT ID on two services, services without their
 * ONT data, light out of range, light falling over time and readings too old to trust. No OLT connection: DavorOLT gives
 * the commands; the readings come from `display ont optical-info` pasted in Clientes.
 */
import { lightDrop, type Client, type Service } from "../clients/model"
import { lightStatus, type LightStatus } from "../clients/optics"
import { normPort } from "../sites/model"

/** ONT IDs per GPON port on the owner's MA5608T boards (GPBD/GPFD/GPBH: 128 ONT per port, lib/olt-kb.ts). */
export const ONTS_PER_PORT = 128
/**
 * A drop this big (dB) between the oldest reading kept and the current one = the light is falling (connector, bend);
 * the same as Números' clients at risk (lib/interno/numbers.ts).
 */
export const DROP_DB = 2
/** A reading older than this (days) isn't trusted any more. */
export const STALE_DAYS = 30

export type Ont = {
  clientId: string
  clientName: string
  siteId: string
  serviceId: string
  status: Service["status"]
  model: string
  sn: string
  port: string
  ontId: number | null
  rx: number | null
  oltRx: number | null
  rxDate: string
  light: LightStatus | null
  /** dB lost since the oldest reading kept (positive = worse); null without two readings. */
  drop: number | null
}

export type Issue =
  | { kind: "dupSn"; sn: string; onts: Ont[] }
  | { kind: "dupId"; port: string; ontId: number; onts: Ont[] }
  | { kind: "missing"; ont: Ont; fields: ("sn" | "port" | "ontId")[] }
  | { kind: "light"; ont: Ont }
  | { kind: "falling"; ont: Ont }
  | { kind: "stale"; ont: Ont; days: number }
  | { kind: "noReading"; ont: Ont }

export type PortRow = { port: string; onts: Ont[]; used: number; free: number; nextFree: number | null }

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

/** Every internet service that isn't cancelled, as an ONT. */
export function ontsOf(clients: Client[]): Ont[] {
  const out: Ont[] = []
  for (const c of clients)
    for (const s of c.services) {
      if (s.type !== "internet" || s.status === "cancelado") continue
      out.push({
        clientId: c.id,
        clientName: c.name,
        siteId: c.siteId,
        serviceId: s.id,
        status: s.status,
        model: s.ontModel,
        sn: s.ontSn.trim().toUpperCase(),
        port: s.oltPort ? normPort(s.oltPort) : "",
        ontId: s.ontId,
        rx: s.rxDbm,
        oltRx: s.oltRxDbm,
        rxDate: s.rxDate,
        light: lightStatus(s.rxDbm),
        drop: lightDrop(s),
      })
    }
  return out
}

/** The ONTs by OLT port (ports in order; ONTs by ID), with how many IDs are left and the lowest free one. */
export function byPort(onts: Ont[]): PortRow[] {
  const m = new Map<string, Ont[]>()
  for (const o of onts) if (o.port) m.set(o.port, [...(m.get(o.port) ?? []), o])
  const key = (p: string) => p.split("/").map((x) => x.padStart(3, "0")).join("/")
  return [...m.entries()]
    .sort((a, b) => key(a[0]).localeCompare(key(b[0])))
    .map(([port, list]) => {
      const ids = new Set(list.flatMap((o) => (o.ontId === null ? [] : [o.ontId])))
      let nextFree: number | null = null
      for (let i = 0; i < ONTS_PER_PORT; i++)
        if (!ids.has(i)) {
          nextFree = i
          break
        }
      const onts = [...list].sort((a, b) => (a.ontId ?? 999) - (b.ontId ?? 999) || a.clientName.localeCompare(b.clientName, "es"))
      return { port, onts, used: ids.size, free: Math.max(0, ONTS_PER_PORT - ids.size), nextFree }
    })
}

/** What needs attention, the conflicts first (they break provisioning), then light, then missing data. */
export function issuesOf(onts: Ont[], today: string): Issue[] {
  const out: Issue[] = []
  const bySn = new Map<string, Ont[]>()
  const byId = new Map<string, Ont[]>()
  for (const o of onts) {
    if (o.sn) bySn.set(o.sn, [...(bySn.get(o.sn) ?? []), o])
    if (o.port && o.ontId !== null) byId.set(`${o.port}#${o.ontId}`, [...(byId.get(`${o.port}#${o.ontId}`) ?? []), o])
  }
  for (const [sn, list] of bySn) if (list.length > 1) out.push({ kind: "dupSn", sn, onts: list })
  for (const list of byId.values()) if (list.length > 1) out.push({ kind: "dupId", port: list[0].port, ontId: list[0].ontId!, onts: list })
  for (const o of onts) {
    if (o.light === "baja" || o.light === "satura") out.push({ kind: "light", ont: o })
    else if (o.drop !== null && o.drop >= DROP_DB) out.push({ kind: "falling", ont: o })
  }
  for (const o of onts) {
    const fields = (["sn", "port", "ontId"] as const).filter((f) => (f === "ontId" ? o.ontId === null : !o[f]))
    if (fields.length) out.push({ kind: "missing", ont: o, fields })
    else if (o.rx === null) out.push({ kind: "noReading", ont: o })
    else if (o.rxDate && days(o.rxDate, today) > STALE_DAYS) out.push({ kind: "stale", ont: o, days: days(o.rxDate, today) })
  }
  return out
}

/** Counts for the header: ONTs, by light, and how many have something to fix. */
export function summary(onts: Ont[], issues: Issue[]) {
  const light = { bien: 0, justo: 0, baja: 0, satura: 0, none: 0 }
  for (const o of onts) light[o.light ?? "none"]++
  return { total: onts.length, light, issues: issues.length }
}
