/**
 * An installation finished on another day than planned (review 2026-11-22): the client's services that started on the
 * planned day (as Alta writes them) start on the day it was really done, so Cobranza charges from the right month (a
 * month is charged if installed by the 15th). Services with another start date were set by hand and are left alone.
 * Pure.
 */
import type { Client } from "../clients/model"

/** The client with the moved start dates, or null when nothing changes. */
export function installedOn(c: Client, planned: string, done: string): Client | null {
  if (!planned || !done || planned === done) return null
  let moved = false
  const services = c.services.map((s) => {
    if (s.status === "cancelado" || s.start !== planned) return s
    moved = true
    return { ...s, start: done }
  })
  return moved ? { ...c, services, updatedAt: new Date().toISOString() } : null
}
