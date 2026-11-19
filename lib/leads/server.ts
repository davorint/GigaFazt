/**
 * Website requests in the database (owner, 2026-11-17): the public contract form saves each one (after answering, so
 * the visitor never waits on it), and /interno/admin/clientes lists them, changes their status and notes, and turns
 * one into a client. Personal data: read and changed only through signed-in /api/interno routes.
 */
import { LEADS_LIMIT } from "./limits"
import "server-only"
import { desc, eq } from "drizzle-orm"
import { getDb, hasDatabase } from "../db/client"
import { LEAD_STATUSES, leads } from "../db/schema"
import type { Lead } from "../lead"

export type LeadStatus = (typeof LEAD_STATUSES)[number]
export type LeadRow = {
  id: string
  createdAt: string
  name: string
  phone: string
  email: string
  address: string
  planId: string
  addOnIds: string[]
  preferredDate: string
  status: LeadStatus
  statusAt: string
  notes: string
  updatedBy: string
}

/** Saves a website request; false when there is no database or the insert failed. */
export async function saveLead(lead: Omit<Lead, "website">, locale: string): Promise<boolean> {
  if (!hasDatabase()) return false
  try {
    await getDb()
      .insert(leads)
      .values({
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? "",
        address: lead.address,
        planId: lead.planId,
        addOnIds: [...lead.addOnIds],
        preferredDate: lead.preferredDate || null,
        locale: locale === "en" ? "en" : "es",
      })
    return true
  } catch (e) {
    console.error("[lead] not saved to the database:", e instanceof Error ? e.message : e)
    return false
  }
}

const row = (r: typeof leads.$inferSelect): LeadRow => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  name: r.name,
  phone: r.phone,
  email: r.email,
  address: r.address,
  planId: r.planId,
  addOnIds: r.addOnIds,
  preferredDate: r.preferredDate ?? "",
  status: (LEAD_STATUSES as readonly string[]).includes(r.status) ? (r.status as LeadStatus) : "nuevo",
  statusAt: r.statusAt.toISOString(),
  notes: r.notes,
  updatedBy: r.updatedBy,
})

/** The newest requests first. */
export async function listLeads(limit = LEADS_LIMIT): Promise<LeadRow[]> {
  const rows = await getDb().select().from(leads).orderBy(desc(leads.createdAt)).limit(limit)
  return rows.map(row)
}

/** Changes a request's status and/or notes; returns it, or null when it doesn't exist. */
export async function updateLead(id: string, patch: { status?: LeadStatus; notes?: string }, editor: string): Promise<LeadRow | null> {
  const set: Partial<typeof leads.$inferInsert> = { updatedBy: editor }
  if (patch.status) {
    set.status = patch.status
    set.statusAt = new Date()
  }
  if (typeof patch.notes === "string") set.notes = patch.notes.slice(0, 4000)
  const r = await getDb().update(leads).set(set).where(eq(leads.id, id)).returning()
  return r[0] ? row(r[0]) : null
}
