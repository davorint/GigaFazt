/**
 * The Neon Postgres database (owner, 2026-11-17): surveys, the master materials list, providers and the saved MikroTik
 * deployments, each shared by the team and synced from the phones, plus the website's leads.
 *
 * Shared records follow one pattern:
 * - the current version in its table (columns for what lists and searches use, the rest as JSON in `data`, so new
 *   fields need no migration), with `version` (+1 on every save), `updated_at` / `updated_by` (the name the phone gave),
 *   and `deleted_at` (deleting only marks it: an offline phone can't bring it back, and it can be restored);
 * - every saved version in a `*_versions` table (history and restore; `conflict` marks the copy that lost when two
 *   phones changed the same record and the newest edit won);
 * - `rev`: a number from one sequence shared by every table, taken on each write, so a phone asks "what changed since
 *   rev N" with one comparison.
 * Leads come from the public form: personal data, behind the /interno password, with a status the team changes.
 */
import { sql } from "drizzle-orm"
import { bigint, bigserial, boolean, date, doublePrecision, index, integer, jsonb, numeric, pgSequence, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/** One counter for every change in every shared table: what a phone asks for when it syncs. */
export const syncRev = pgSequence("sync_rev", { startWith: 1 })
const nextRev = sql`nextval('sync_rev')`

/** Columns every shared record has. */
const shared = () => ({
  version: integer("version").notNull().default(1),
  rev: bigint("rev", { mode: "number" }).notNull().default(nextRev),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull().default(""),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
})

/** Every saved version of a record of `table`. */
const versions = (name: string, parent: string) =>
  pgTable(
    name,
    {
      id: bigserial("id", { mode: "number" }).primaryKey(),
      recordId: text(parent).notNull(),
      version: integer("version").notNull(),
      data: jsonb("data").notNull(),
      savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
      savedBy: text("saved_by").notNull().default(""),
      /** This copy lost a conflict (two phones changed the record; the newest edit won). */
      conflict: boolean("conflict").notNull().default(false),
    },
    (t) => [index(`${name}_record_idx`).on(t.recordId, t.version)]
  )

// ── Surveys (levantamientos) ────────────────────────────────────────────────

export const surveys = pgTable(
  "surveys",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    address: text("address").notNull().default(""),
    municipality: text("municipality").notNull().default(""),
    status: text("status").notNull().default("draft"),
    /** The whole survey (lib/survey/model.ts), read back through decodeSurvey. */
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("surveys_rev_idx").on(t.rev), index("surveys_updated_idx").on(t.updatedAt)]
)
export const surveyVersions = versions("survey_versions", "survey_id")

// ── Master materials list ───────────────────────────────────────────────────

export const materials = pgTable(
  "materials",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull(),
    /** MXN with IVA included; null = no price yet. */
    price: numeric("price", { precision: 12, scale: 2, mode: "number" }),
    role: text("role").notNull().default(""),
    supplierId: text("supplier_id").notNull().default(""),
    /** The whole item (lib/materials/catalog.ts). */
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("materials_rev_idx").on(t.rev), index("materials_supplier_idx").on(t.supplierId)]
)
export const materialVersions = versions("material_versions", "material_id")

// ── Providers ───────────────────────────────────────────────────────────────

export const providers = pgTable(
  "providers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    /** "material,carrier,…" (lib/providers/model.ts kinds). */
    kinds: text("kinds").notNull().default(""),
    rfc: text("rfc").notNull().default(""),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("providers_rev_idx").on(t.rev)]
)
export const providerVersions = versions("provider_versions", "provider_id")

// ── Subscribers ─────────────────────────────────────────────────────────────

export const clients = pgTable(
  "clients",
  {
    id: text("id").primaryKey(),
    /** residencial / administracion / empresa / tv. */
    kind: text("kind").notNull().default("residencial"),
    name: text("name").notNull().default(""),
    building: text("building").notNull().default(""),
    apartment: text("apartment").notNull().default(""),
    /** The PPPoE users of its internet services, comma-separated. */
    pppoeUser: text("pppoe_user").notNull().default(""),
    /** From its services: activo / suspendido / cancelado / sin-servicio. */
    status: text("status").notNull().default("activo"),
    /** The whole client (lib/clients/model.ts). */
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("clients_rev_idx").on(t.rev), index("clients_pppoe_idx").on(t.pppoeUser), index("clients_building_idx").on(t.building)]
)
export const clientVersions = versions("client_versions", "client_id")

// ── Deployment locations (/interno/admin/despliegues) ───────────────────────

export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    address: text("address").notNull().default(""),
    municipality: text("municipality").notNull().default(""),
    /** How many telecom rooms and towers it has. */
    rooms: integer("rooms").notNull().default(0),
    towers: integer("towers").notNull().default(0),
    /** The whole location (lib/sites/model.ts). */
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("sites_rev_idx").on(t.rev)]
)
export const siteVersions = versions("site_versions", "site_id")

// ── Tools (/interno/admin/herramientas) ───────────────────────────────────

export const tools = pgTable(
  "tools",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    category: text("category").notNull().default(""),
    serial: text("serial").notNull().default(""),
    quantity: integer("quantity").notNull().default(1),
    condition: text("condition").notNull().default("bien"),
    /** Where it is: bodega / tecnico / despliegue / vehiculo / otro, and who (a name, or the location's id). */
    holderKind: text("holder_kind").notNull().default("bodega"),
    holder: text("holder").notNull().default(""),
    /** The whole tool (lib/tools/model.ts). */
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("tools_rev_idx").on(t.rev), index("tools_holder_idx").on(t.holder)]
)
export const toolVersions = versions("tool_versions", "tool_id")

// ── Installation stock (/interno/admin/materiales) ─────────────────────────

export const stockMoves = pgTable(
  "stock_moves",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull().default(""),
    /** compra / traspaso / instalacion / reemplazo / devolucion / baja / ajuste (lib/stock/model.ts). */
    kind: text("kind").notNull().default(""),
    qty: doublePrecision("qty").notNull().default(0),
    date: text("date").notNull().default(""),
    clientId: text("client_id").notNull().default(""),
    /** The whole movement. */
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("stock_moves_rev_idx").on(t.rev), index("stock_moves_item_idx").on(t.itemId)]
)
export const stockMoveVersions = versions("stock_move_versions", "move_id")

/** ONTs and other equipment tracked one by one. */
export const units = pgTable(
  "units",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull().default(""),
    serial: text("serial").notNull().default(""),
    /** almacen / cliente / danado / perdido / proveedor. */
    state: text("state").notNull().default("almacen"),
    clientId: text("client_id").notNull().default(""),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("units_rev_idx").on(t.rev), index("units_serial_idx").on(t.serial), index("units_client_idx").on(t.clientId)]
)
export const unitVersions = versions("unit_versions", "unit_id")

// ── Client problem reports (/interno/admin/reportes_clientes) ──────────────

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey(),
    /** nuevo / en-proceso / visita / resuelto / descartado (lib/reports/model.ts). */
    status: text("status").notNull().default("nuevo"),
    category: text("category").notNull().default(""),
    clientId: text("client_id").notNull().default(""),
    /** interno (staff) or web (the public form). */
    source: text("source").notNull().default("interno"),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("reports_rev_idx").on(t.rev), index("reports_client_idx").on(t.clientId), index("reports_status_idx").on(t.status)]
)
export const reportVersions = versions("report_versions", "report_id")

/**
 * Public report form flood control (lib/reports/limits.ts): one row per accepted web report with a salted hash of the
 * sender's address (never the address itself), kept a day.
 */
export const reportHits = pgTable(
  "report_hits",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ipHash: text("ip_hash").notNull().default(""),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("report_hits_at_idx").on(t.at), index("report_hits_ip_idx").on(t.ipHash, t.at)]
)

// ── Payments (/interno/admin/clientes → Cobranza) ─────────────────────────

export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().default(""),
    date: date("date"),
    amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("payments_rev_idx").on(t.rev), index("payments_client_idx").on(t.clientId), index("payments_date_idx").on(t.date)]
)
export const paymentVersions = versions("payment_versions", "payment_id")

// ── Notes (/interno/admin/notas) ───────────────────────────────────────────

export const notes = pgTable(
  "notes",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull().default(""),
    /** Marked done (archived in "Hechas"). */
    done: boolean("done").notNull().default(false),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("notes_rev_idx").on(t.rev)]
)
export const noteVersions = versions("note_versions", "note_id")

// ── Fiber rolls (/interno/admin/materiales?t=bobinas) ───────────────────────

export const rolls = pgTable(
  "rolls",
  {
    id: text("id").primaryKey(),
    /** The number on the reel ("B-12"). */
    code: text("code").notNull().default(""),
    cable: text("cable").notNull().default(""),
    place: text("place").notNull().default(""),
    leftM: doublePrecision("left_m").notNull().default(0),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("rolls_rev_idx").on(t.rev)]
)
export const rollVersions = versions("roll_versions", "roll_id")

// ── Saved MikroTik deployments ──────────────────────────────────────────────

export const deployments = pgTable(
  "deployments",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().default(""),
    /** The deployment in the same text format as its share link (lib/mikrotik/state.ts encodeDeployment). */
    data: text("data").notNull(),
    ...shared(),
  },
  (t) => [index("deployments_rev_idx").on(t.rev)]
)
export const deploymentVersions = versions("deployment_versions", "deployment_id")

// ── Website leads ───────────────────────────────────────────────────────────

export const LEAD_STATUSES = ["nuevo", "contactado", "instalado", "descartado"] as const

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull().default(""),
    address: text("address").notNull(),
    planId: text("plan_id").notNull(),
    addOnIds: jsonb("add_on_ids").$type<string[]>().notNull().default([]),
    preferredDate: date("preferred_date"),
    /** When the visitor accepted the privacy notice (the form requires it). */
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull().defaultNow(),
    locale: text("locale").notNull().default("es"),
    status: text("status").notNull().default("nuevo"),
    statusAt: timestamp("status_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes").notNull().default(""),
    updatedBy: text("updated_by").notNull().default(""),
  },
  (t) => [index("leads_created_idx").on(t.createdAt), index("leads_status_idx").on(t.status)]
)
