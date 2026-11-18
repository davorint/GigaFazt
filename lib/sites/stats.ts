/** A location's clients: how many, active, monthly total, per tower and per PON port. */
import { clientStatus, monthlyTotal, type Client } from "../clients/model"
import { normPort, type Room, type Site } from "./model"

export type SiteStats = {
  clients: number
  active: number
  /** Monthly total of the active services of its clients. */
  monthly: number
  byTower: Record<string, { clients: number; active: number }>
  /** Clients without a tower. */
  noTower: number
}

export const clientsOf = (s: Site, clients: Client[]) => clients.filter((c) => c.siteId === s.id)

export function siteStats(s: Site, clients: Client[]): SiteStats {
  const mine = clientsOf(s, clients)
  const towers = new Set(s.towers.map((t) => t.id))
  const byTower: SiteStats["byTower"] = Object.fromEntries(s.towers.map((t) => [t.id, { clients: 0, active: 0 }]))
  let noTower = 0
  for (const c of mine) {
    const b = towers.has(c.towerId) ? byTower[c.towerId] : null
    if (!b) {
      noTower++
      continue
    }
    b.clients++
    if (clientStatus(c) === "activo") b.active++
  }
  return {
    clients: mine.length,
    active: mine.filter((c) => clientStatus(c) === "activo").length,
    monthly: mine.reduce((a, c) => a + monthlyTotal(c), 0),
    byTower,
    noTower,
  }
}

/**
 * Clients on each PON port of a room: the location's clients whose internet service names that port (typed as
 * 0/1/0, 0-1-0…), counting only clients whose tower is served by this room (or who have no tower, when the location
 * has a single room). Cancelled services don't count.
 */
export function portClients(s: Site, room: Room, clients: Client[]): Record<string, number> {
  const roomOf = new Map(s.towers.map((t) => [t.id, t.roomId]))
  const single = s.rooms.length === 1
  const out: Record<string, number> = Object.fromEntries(room.ports.map((p) => [p.id, 0]))
  const byPort = new Map(room.ports.filter((p) => p.port.trim()).map((p) => [normPort(p.port), p.id]))
  for (const c of clientsOf(s, clients)) {
    const r = roomOf.get(c.towerId)
    if (r ? r !== room.id : !single) continue
    for (const sv of c.services) {
      if (sv.type !== "internet" || sv.status === "cancelado" || !sv.oltPort) continue
      const id = byPort.get(normPort(sv.oltPort))
      if (id) out[id]++
    }
  }
  return out
}
