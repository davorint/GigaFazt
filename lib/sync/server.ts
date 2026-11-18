/**
 * Applying a phone's changes and returning what changed since its last sync (POST /api/interno/sync).
 *
 * Every incoming record is decoded again with the same readers the phones use (decodeSurvey, decodeItem,
 * decodeProvider), so the database only ever holds well-formed records. Each change is applied in its own transaction
 * with the row locked (`FOR UPDATE`):
 * - new id → inserted (version 1);
 * - same version the phone started from → saved (version + 1);
 * - someone else saved in between → the most recent edit wins; the losing copy goes to the history with
 *   `conflict = true`;
 * - an untouched starter material (no price, no supplier) whose name, role and unit the database already has →
 *   not inserted: the phone is told to use the existing id (each browser made its own copy of the 27 starters);
 * - a starter (fixed id: materials, tools) deleted before anyone saved it → a deleted row is stored, so every other
 *   phone removes its own copy.
 * Every write takes a new number from the shared `sync_rev` sequence, which is what pulls compare.
 */
import "server-only"
import type { PoolClient } from "pg"
import { decodeItem } from "../materials/catalog"
import { decodeProvider, providerName } from "../providers/model"
import { decodeSurvey } from "../survey/model"
import { clientStatus, decodeClient, pppoeUsers } from "../clients/model"
import { decodeSite } from "../sites/model"
import { decodeTool, toolLabel } from "../tools/model"
import { decodeMove, decodeUnit } from "../stock/model"
import { decodeReport } from "../reports/model"
import { getPool } from "../db/client"
import { MAX_RECORDS, type Change, type Outcome, type Remote, type SyncKind, type SyncResponse } from "./protocol"

const ID = /^[\w-]{6,64}$/

type Columns = Record<string, string | number | null>
type KindSpec = {
  table: string
  versions: string
  fk: string
  /** The record decoded and its listing columns, or null when it isn't a valid record. */
  read: (id: string, data: unknown) => { data: Record<string, unknown>; cols: Columns } | null
  /** Listing columns without a default, for the row that records a deleted starter. */
  tombstone?: Columns
}

const SPECS: Record<SyncKind, KindSpec> = {
  surveys: {
    table: "surveys",
    versions: "survey_versions",
    fk: "survey_id",
    read: (id, data) => {
      const s = decodeSurvey(data)
      if (!s) return null
      const d = { ...s, id }
      return { data: d, cols: { name: d.ident.name, address: d.ident.address, municipality: d.ident.municipality, status: d.status } }
    },
  },
  materials: {
    table: "materials",
    versions: "material_versions",
    fk: "material_id",
    tombstone: { name: "", category: "", unit: "" },
    read: (id, data) => {
      const it = decodeItem(data)
      if (!it) return null
      const d = { ...it, id }
      return { data: d, cols: { name: d.name, category: d.category, unit: d.unit, price: d.price, role: d.role, supplier_id: d.supplierId } }
    },
  },
  providers: {
    table: "providers",
    versions: "provider_versions",
    fk: "provider_id",
    read: (id, data) => {
      const p = decodeProvider(data)
      if (!p) return null
      const d = { ...p, id }
      return { data: d, cols: { name: providerName(d), kinds: d.kinds.join(","), rfc: d.rfc } }
    },
  },
  clients: {
    table: "clients",
    versions: "client_versions",
    fk: "client_id",
    read: (id, data) => {
      const c = decodeClient(data)
      if (!c) return null
      const d = { ...c, id }
      return { data: d, cols: { kind: d.kind, name: d.name, building: d.building, apartment: d.apartment, pppoe_user: pppoeUsers(d).join(",").slice(0, 300), status: clientStatus(d) } }
    },
  },
  sites: {
    table: "sites",
    versions: "site_versions",
    fk: "site_id",
    read: (id, data) => {
      const s = decodeSite(data)
      if (!s) return null
      const d = { ...s, id }
      return { data: d, cols: { name: d.name, address: d.address, municipality: d.municipality, rooms: d.rooms.length, towers: d.towers.length } }
    },
  },
  tools: {
    table: "tools",
    versions: "tool_versions",
    fk: "tool_id",
    read: (id, data) => {
      const x = decodeTool(data)
      if (!x) return null
      const d = { ...x, id }
      const holder = d.holderKind === "despliegue" ? d.siteId : d.holderKind === "bodega" ? "" : d.holder
      return { data: d, cols: { name: toolLabel(d).slice(0, 300), category: d.category, serial: d.serial, quantity: d.quantity, condition: d.condition, holder_kind: d.holderKind, holder: holder.slice(0, 100) } }
    },
  },
  stock: {
    table: "stock_moves",
    versions: "stock_move_versions",
    fk: "move_id",
    read: (id, data) => {
      const m = decodeMove(data)
      if (!m) return null
      const d = { ...m, id }
      return { data: d, cols: { item_id: d.itemId, kind: d.kind, qty: d.qty, date: d.date, client_id: d.clientId } }
    },
  },
  units: {
    table: "units",
    versions: "unit_versions",
    fk: "unit_id",
    read: (id, data) => {
      const u = decodeUnit(data)
      if (!u) return null
      const d = { ...u, id }
      return { data: d, cols: { item_id: d.itemId, serial: d.serial, state: d.state, client_id: d.clientId } }
    },
  },
  reports: {
    table: "reports",
    versions: "report_versions",
    fk: "report_id",
    read: (id, data) => {
      const r = decodeReport(data)
      if (!r) return null
      const d = { ...r, id }
      return { data: d, cols: { status: d.status, category: d.category, client_id: d.clientId, source: d.source } }
    },
  },
}

/** The phone's edit time, never in the future (a wrong phone clock can't win every conflict). */
function editTime(iso: string): Date {
  const t = Date.parse(iso)
  const now = Date.now()
  return Number.isFinite(t) ? new Date(Math.min(t, now)) : new Date(now)
}

async function applyOne(c: PoolClient, kind: SyncKind, ch: Change, editor: string): Promise<Outcome> {
  const spec = SPECS[kind]
  if (!ID.test(ch.id)) return { id: ch.id, outcome: "rejected", reason: "bad-id" }
  const read = ch.deleted ? null : spec.read(ch.id, ch.data)
  if (!ch.deleted && !read) return { id: ch.id, outcome: "rejected", reason: "bad-data" }
  const at = editTime(ch.editedAt)
  const cur = (await c.query(`select version, updated_at, data from "${spec.table}" where id = $1 for update`, [ch.id])).rows[0] as { version: number; updated_at: Date; data: unknown } | undefined

  if (!cur) {
    // A starter record (fixed id, created by every browser on its own) deleted before anyone edited it: store the
    // deletion, or the other phones would keep their copy forever.
    if (ch.deleted && ch.id.startsWith("starter-")) {
      const extra = spec.tombstone ?? {}
      const keys = Object.keys(extra)
      await c.query(
        `insert into "${spec.table}" (id, data, version, updated_at, updated_by, deleted_at${keys.map((k) => `, ${k}`).join("")}) values ($1, $2, 1, $3, $4, now()${keys.map((_, i) => `, $${i + 5}`).join("")})`,
        [ch.id, { id: ch.id }, at, editor, ...Object.values(extra)]
      )
      await c.query(`insert into "${spec.versions}" (${spec.fk}, version, data, saved_by) values ($1, 1, $2, $3)`, [ch.id, { id: ch.id }, `${editor} (borrado)`])
      return { id: ch.id, outcome: "saved", version: 1 }
    }
    // Deleted before it ever reached the database: nothing to store.
    if (ch.deleted || !read) return { id: ch.id, outcome: "saved", version: 0 }
    if (kind === "materials") {
      const d = read.data as { price: number | null; supplierId: string; name: string; role: string; unit: string }
      if (d.price === null && !d.supplierId) {
        const same = (await c.query(`select id from materials where deleted_at is null and name = $1 and role = $2 and unit = $3 order by created_at limit 1`, [d.name, d.role, d.unit])).rows[0] as { id: string } | undefined
        if (same) return { id: ch.id, outcome: "merged", into: same.id }
      }
    }
    const cols = Object.keys(read.cols)
    const values = Object.values(read.cols)
    await c.query(
      `insert into "${spec.table}" (id, data, version, updated_at, updated_by${cols.map((k) => `, ${k}`).join("")}) values ($1, $2, 1, $3, $4${cols.map((_, k) => `, $${k + 5}`).join("")})`,
      [ch.id, read.data, at, editor, ...values]
    )
    await c.query(`insert into "${spec.versions}" (${spec.fk}, version, data, saved_by) values ($1, 1, $2, $3)`, [ch.id, read.data, editor])
    return { id: ch.id, outcome: "saved", version: 1 }
  }

  const conflict = ch.baseVersion !== cur.version
  if (conflict && at <= cur.updated_at) {
    // Another phone's newer edit stays; this copy goes to the history.
    if (read) await c.query(`insert into "${spec.versions}" (${spec.fk}, version, data, saved_by, conflict) values ($1, $2, $3, $4, true)`, [ch.id, cur.version, read.data, editor])
    return { id: ch.id, outcome: "kept-server", version: cur.version }
  }
  if (conflict) await c.query(`update "${spec.versions}" set conflict = true where ${spec.fk} = $1 and version = $2`, [ch.id, cur.version])
  const version = cur.version + 1
  if (ch.deleted) {
    await c.query(`update "${spec.table}" set deleted_at = now(), version = $2, rev = nextval('sync_rev'), updated_at = $3, updated_by = $4 where id = $1`, [ch.id, version, at, editor])
    await c.query(`insert into "${spec.versions}" (${spec.fk}, version, data, saved_by) values ($1, $2, $3, $4)`, [ch.id, version, cur.data, `${editor} (borrado)`])
  } else if (read) {
    const cols = Object.keys(read.cols)
    await c.query(
      `update "${spec.table}" set data = $2, version = $3, rev = nextval('sync_rev'), updated_at = $4, updated_by = $5, deleted_at = null${cols.map((k, i) => `, ${k} = $${i + 6}`).join("")} where id = $1`,
      [ch.id, read.data, version, at, editor, ...Object.values(read.cols)]
    )
    await c.query(`insert into "${spec.versions}" (${spec.fk}, version, data, saved_by) values ($1, $2, $3, $4)`, [ch.id, version, read.data, editor])
  }
  return { id: ch.id, outcome: "saved", version }
}

/** Applies the changes (each in its own transaction) and returns everything changed since `since`. */
export async function sync(kind: SyncKind, since: number, changes: Change[], editor: string): Promise<SyncResponse> {
  const pool = getPool()
  const results: Outcome[] = []
  const c = await pool.connect()
  try {
    for (const ch of changes) {
      try {
        await c.query("begin")
        results.push(await applyOne(c, kind, ch, editor))
        await c.query("commit")
      } catch (e) {
        await c.query("rollback").catch(() => {})
        results.push({ id: ch.id, outcome: "rejected", reason: e instanceof Error ? e.message.slice(0, 120) : "error" })
      }
    }
  } finally {
    c.release()
  }
  const spec = SPECS[kind]
  const rows = (
    await pool.query(`select id, version, data, deleted_at, updated_at, updated_by, rev from "${spec.table}" where rev > $1 order by rev limit $2`, [Math.max(0, since), MAX_RECORDS + 1])
  ).rows as { id: string; version: number; data: unknown; deleted_at: Date | null; updated_at: Date; updated_by: string; rev: string | number }[]
  const more = rows.length > MAX_RECORDS
  const records: Remote[] = rows.slice(0, MAX_RECORDS).map((r) => ({
    id: r.id,
    version: r.version,
    data: r.data,
    deleted: r.deleted_at !== null,
    editedAt: r.updated_at.toISOString(),
    editedBy: r.updated_by,
    rev: Number(r.rev),
  }))
  const rev = records.length ? records[records.length - 1].rev : since
  return { kind, rev, more, results, records }
}
