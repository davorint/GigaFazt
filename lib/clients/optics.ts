/**
 * Light at each client's ONT (owner, 2026-11-18): the readings pasted from the OLT go on each client's internet service,
 * matched by OLT port + ONT ID within the location the OLT belongs to.
 *
 * The OLT's output isn't documented in a source we could read, so the reader accepts the shapes Huawei's CLI is
 * commonly shown with, and anything else as simple lines:
 * 1. the port table of `display ont optical-info <port> all` (inside `interface gpon F/S`): a row per ONT with
 *    ONT-ID, Rx power, Tx power, OLT Rx power…; the frame/slot comes from the prompt or the `interface gpon` line, the
 *    port from the command (rows that start with F/S/P are read too);
 * 2. the detail of one ONT (`display ont optical-info <port> <ont-id>`): "F/S/P : 0/1/0", "ONT-ID : 5",
 *    "Rx optical power(dBm) : -19.38", "OLT Rx ONT optical power(dBm) : -21.55";
 * 3. plain lines "0/1/0 5 -19.38" or "0/1/0,5,-19.38,-21.55" (port, ONT ID, ONT Rx, optional OLT Rx).
 * ONTs offline show "-" and are skipped. Thresholds: the EG8145B7-50's sensitivity −27 dBm (Huawei) with a 3 dB
 * margin; above −8 dBm the receiver saturates (typical class B+ value).
 */
import { normPort } from "../sites/model"
import type { Client, Service } from "./model"

export type Reading = { port: string; ontId: number; rx: number; oltRx: number | null; line: number }

export const ONT_SENSITIVITY = -27
export const ONT_OVERLOAD = -8
export const MARGIN = 3

export type LightStatus = "bien" | "justo" | "baja" | "satura"
export function lightStatus(rx: number | null): LightStatus | null {
  if (rx === null) return null
  if (rx > ONT_OVERLOAD) return "satura"
  if (rx < ONT_SENSITIVITY) return "baja"
  if (rx < ONT_SENSITIVITY + MARGIN) return "justo"
  return "bien"
}

const dbm = (s: string | undefined) => {
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) && n >= -60 && n <= 15 ? n : null
}

export function parseOltOptics(text: string): { readings: Reading[]; offline: number } {
  const readings: Reading[] = []
  let offline = 0
  let fs = "" // frame/slot from the prompt or `interface gpon F/S`
  let port = "" // from `optical-info <port> all`
  let detail: { port?: string; ontId?: number; rx?: number | null; oltRx?: number | null; line: number } | null = null
  const flush = () => {
    if (detail?.port && detail.ontId !== undefined) {
      if (detail.rx === null || detail.rx === undefined) offline++
      else readings.push({ port: detail.port, ontId: detail.ontId, rx: detail.rx, oltRx: detail.oltRx ?? null, line: detail.line })
    }
    detail = null
  }
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = raw.trim()
    const n = i + 1
    const gpon = /gpon[-\s]+(\d+)\s*\/\s*(\d+)(?!\s*\/)/i.exec(line)
    if (gpon) fs = `${gpon[1]}/${gpon[2]}`
    const cmd = /optical-info\s+(\d+)\s+all\b/i.exec(line)
    if (cmd) {
      port = cmd[1]
      return
    }
    // Detail blocks
    const fsp = /^F\/S\/P\s*:\s*(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/i.exec(line)
    if (fsp) {
      flush()
      detail = { port: `${fsp[1]}/${fsp[2]}/${fsp[3]}`, line: n }
      return
    }
    if (detail) {
      const id = /^ONT-?ID\s*:\s*(\d+)/i.exec(line)
      if (id) detail.ontId = Number(id[1])
      const oltRx = /^OLT\s+Rx\s+ONT\s+optical\s+power\s*\(dBm\)\s*:\s*(\S+)/i.exec(line)
      if (oltRx) detail.oltRx = dbm(oltRx[1])
      else {
        const rx = /^Rx\s+optical\s+power\s*\(dBm\)\s*:\s*(\S+)/i.exec(line)
        if (rx) detail.rx = dbm(rx[1])
      }
      if (/^-{5,}$/.test(line) && detail.ontId !== undefined && detail.rx !== undefined) flush()
      return
    }
    // A row that starts with F/S/P: port, ONT ID, Rx, Tx, OLT Rx…
    const full = /^(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)\s+(\d+)\s+(-?\d+(?:\.\d+)?|-)(?:\s+(-?\d+(?:\.\d+)?|-))?(?:\s+(-?\d+(?:\.\d+)?|-))?/.exec(line)
    if (full) {
      const rx = dbm(full[5])
      if (rx === null) offline++
      else readings.push({ port: `${full[1]}/${full[2]}/${full[3]}`, ontId: Number(full[4]), rx, oltRx: dbm(full[7]), line: n })
      return
    }
    // Plain lines: "0/1/0,5,-19.38[,-21.55]"
    const plain = /^(\d+\s*\/\s*\d+\s*\/\s*\d+)[\s,;]+(\d+)[\s,;]+(-?\d+(?:\.\d+)?)(?:[\s,;]+(-?\d+(?:\.\d+)?))?\s*$/.exec(line)
    if (plain) {
      const rx = dbm(plain[3])
      if (rx !== null) readings.push({ port: normPort(plain[1]), ontId: Number(plain[2]), rx, oltRx: dbm(plain[4]), line: n })
      return
    }
    // The port table: ONT-ID, Rx, Tx, OLT Rx… (needs the port from the command and the frame/slot from the prompt)
    const row = /^(\d+)\s+(-?\d+(?:\.\d+)?|-)\s+(-?\d+(?:\.\d+)?|-)(?:\s+(-?\d+(?:\.\d+)?|-))?/.exec(line)
    if (row && fs && port !== "") {
      const rx = dbm(row[2])
      if (rx === null) offline++
      else readings.push({ port: `${fs}/${port}`, ontId: Number(row[1]), rx, oltRx: dbm(row[4]), line: n })
    }
  })
  flush()
  return { readings, offline }
}

export type OpticsMatch = {
  /** Each reading with the client and service it belongs to. */
  matched: { reading: Reading; client: Client; serviceId: string }[]
  /** Readings without a client on that port and ONT ID. */
  unknown: Reading[]
}

/** Matches readings to the internet services with that OLT port and ONT ID (only the location's clients when one is given). */
export function matchOptics(readings: Reading[], clients: Client[], siteId: string): OpticsMatch {
  const pool = siteId ? clients.filter((c) => c.siteId === siteId) : clients
  const index = new Map<string, { client: Client; service: Service }>()
  for (const c of pool) for (const s of c.services) if (s.type === "internet" && s.oltPort && s.ontId !== null) index.set(`${normPort(s.oltPort)}#${s.ontId}`, { client: c, service: s })
  const matched: OpticsMatch["matched"] = []
  const unknown: Reading[] = []
  for (const r of readings) {
    const hit = index.get(`${normPort(r.port)}#${r.ontId}`)
    if (hit) matched.push({ reading: r, client: hit.client, serviceId: hit.service.id })
    else unknown.push(r)
  }
  return { matched, unknown }
}

/** The clients with the readings applied (one copy per client, every matched service updated). */
export function applyOptics(m: OpticsMatch, date: string): Client[] {
  const out = new Map<string, Client>()
  for (const { reading, client, serviceId } of m.matched) {
    const c = out.get(client.id) ?? client
    out.set(client.id, { ...c, services: c.services.map((s) => (s.id === serviceId ? { ...s, rxDbm: reading.rx, oltRxDbm: reading.oltRx, rxDate: date } : s)) })
  }
  return [...out.values()]
}

/** The worst light among a client's internet services that aren't cancelled (null = no reading). */
export function clientLight(c: Client): { rx: number; status: LightStatus } | null {
  const rank: Record<LightStatus, number> = { baja: 0, satura: 1, justo: 2, bien: 3 }
  let worst: { rx: number; status: LightStatus } | null = null
  for (const s of c.services) {
    if (s.type !== "internet" || s.status === "cancelado" || s.rxDbm === null) continue
    const st = lightStatus(s.rxDbm)!
    if (!worst || rank[st] < rank[worst.status]) worst = { rx: s.rxDbm, status: st }
  }
  return worst
}
