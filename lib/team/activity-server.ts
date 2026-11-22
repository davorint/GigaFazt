/**
 * The activity log (phase 14, owner 2026-11-22: "do all"): who changed what, for admins. It isn't a new record of its
 * own: every synced record already keeps each version with who saved it and when (the *_versions tables), so the log
 * reads those, plus router actions (staff and automatic) and WhatsApp sends. Server code only.
 */
import "server-only"
import { getPool } from "../db/client"
import { recordLabel } from "../sync/labels"
import { SYNC_KINDS, type SyncKind } from "../sync/protocol"
import { SPECS } from "../sync/server"

export type ActivityKind = SyncKind | "router" | "whatsapp"
export type Entry = { at: string; who: string; kind: ActivityKind; ref: string; what: "new" | "edit" | "delete" | "conflict" | "action" | "send"; label: string; detail: string }

export const ACTIVITY_DAYS = [1, 7, 30, 90] as const
const LIMIT = 400

export async function activity(f: { days: number; who: string; kind: string }): Promise<{ entries: Entry[]; people: string[]; more: boolean }> {
  const pool = getPool()
  const days = (ACTIVITY_DAYS as readonly number[]).includes(f.days) ? f.days : 7
  const who = f.who.trim()
  const kinds: ActivityKind[] = f.kind && ([...SYNC_KINDS, "router", "whatsapp"] as string[]).includes(f.kind) ? [f.kind as ActivityKind] : [...SYNC_KINDS, "router", "whatsapp"]
  const out: Entry[] = []
  // The exact person (a deletion is saved as "<name> (borrado)").
  const whoSql = (col: string, i: number) => (who ? ` and (${col} = $${i} or ${col} = $${i} || ' (borrado)')` : "")
  const args = (base: unknown[]) => (who ? [...base, who] : base)
  for (const k of kinds) {
    if (k === "router") {
      const rows = (
        await pool.query(
          `select a.created_at, a.created_by, a.router_id, a.kind, a."user", a.arg1, a.status, a.source, r.name from router_actions a left join routers r on r.id = a.router_id
            where a.created_at > now() - make_interval(days => $1)${whoSql("a.created_by", 2)} order by a.created_at desc limit ${LIMIT}`,
          args([days])
        )
      ).rows as { created_at: Date; created_by: string; router_id: string; kind: string; user: string; arg1: string; status: string; source: string; name: string | null }[]
      for (const r of rows)
        out.push({ at: r.created_at.toISOString(), who: r.created_by || (r.source === "auto" ? "Automático" : ""), kind: "router", ref: r.router_id, what: "action", label: r.name ?? r.router_id, detail: [r.kind, r.user, r.arg1, r.status].filter(Boolean).join(" · ") })
      continue
    }
    if (k === "whatsapp") {
      const rows = (
        await pool.query(
          `select s.sent_at, s.sent_by, s.client_id, s.template, s.status, c.data->>'name' as name from whatsapp_sends s left join clients c on c.id = s.client_id
            where s.sent_at > now() - make_interval(days => $1)${whoSql("s.sent_by", 2)} order by s.sent_at desc limit ${LIMIT}`,
          args([days])
        )
      ).rows as { sent_at: Date; sent_by: string; client_id: string; template: string; status: string; name: string | null }[]
      for (const r of rows) out.push({ at: r.sent_at.toISOString(), who: r.sent_by, kind: "whatsapp", ref: r.client_id, what: "send", label: r.name ?? r.client_id, detail: `${r.template} · ${r.status}` })
      continue
    }
    const s = SPECS[k]
    const rows = (
      await pool.query(
        `select ${s.fk} as ref, version, data, saved_by, saved_at, conflict from "${s.versions}"
          where saved_at > now() - make_interval(days => $1)${whoSql("saved_by", 2)} order by saved_at desc limit ${LIMIT}`,
        args([days])
      )
    ).rows as { ref: string; version: number; data: unknown; saved_by: string; saved_at: Date; conflict: boolean }[]
    for (const r of rows) {
      const deleted = / \(borrado\)$/.test(r.saved_by)
      out.push({
        at: r.saved_at.toISOString(),
        who: r.saved_by.replace(/ \(borrado\)$/, ""),
        kind: k,
        ref: r.ref,
        what: deleted ? "delete" : r.conflict ? "conflict" : r.version === 1 ? "new" : "edit",
        label: safeLabel(k, r.data) || r.ref,
        detail: "",
      })
    }
  }
  out.sort((a, b) => b.at.localeCompare(a.at))
  const people = ((await pool.query(
    `select distinct saved_by as who from client_versions where saved_at > now() - interval '90 days'
     union select distinct saved_by from payment_versions where saved_at > now() - interval '90 days'
     union select distinct created_by from router_actions where created_at > now() - interval '90 days'
     union select name from team_members where active`
  )).rows as { who: string }[])
    .map((r) => r.who.replace(/ \(borrado\)$/, "").trim())
    .filter(Boolean)
  return { entries: out.slice(0, LIMIT), people: [...new Set(people)].sort((a, b) => a.localeCompare(b, "es")), more: out.length > LIMIT }
}

function safeLabel(kind: SyncKind, data: unknown): string {
  try {
    return recordLabel(kind, data)
  } catch {
    return ""
  }
}
