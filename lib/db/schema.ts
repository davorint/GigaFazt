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
import { bigint, bigserial, boolean, customType, date, doublePrecision, index, integer, jsonb, numeric, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

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

// ── Tools (/interno/herramientas/en-existencia) ───────────────────────────────────

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

// ── Installation stock (/interno/materiales/en-existencia) ─────────────────────────

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

// ── Fiber rolls (/interno/materiales/en-existencia?t=bobinas) ───────────────────────

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

// ── Tool buying options (/interno/herramientas/compras) ───────────────

export const toolBuys = pgTable(
  "tool_buys",
  {
    id: text("id").primaryKey(),
    /** What it's for ("Fusionadora de fibra óptica"). */
    need: text("need").notNull().default(""),
    /** Brand and model. */
    label: text("label").notNull().default(""),
    status: text("status").notNull().default("idea"),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("tool_buys_rev_idx").on(t.rev)]
)
export const toolBuyVersions = versions("tool_buy_versions", "tool_buy_id")

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

export const LEAD_STATUSES = ["nuevo", "contactado", "agendado", "instalado", "descartado"] as const

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

// ── Agenda: installations and visits (/interno/admin/agenda) ────────────────

export const appointments = pgTable(
  "appointments",
  {
    id: text("id").primaryKey(),
    /** yyyy-mm-dd. */
    date: text("date").notNull().default(""),
    kind: text("kind").notNull().default("instalacion"),
    /** The technician ("" = not assigned). */
    who: text("who").notNull().default(""),
    status: text("status").notNull().default("pendiente"),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("appointments_rev_idx").on(t.rev), index("appointments_date_idx").on(t.date)]
)
export const appointmentVersions = versions("appointment_versions", "appointment_id")

// ── Team accounts (/interno/admin/usuarios) ─────────────────────────────────

/**
 * One account per person (owner, 2026-11-19): name + their own password (PBKDF2 hash, lib/team), same access for
 * everyone; admins add and remove people. Once an active admin exists, the shared team password stops working.
 */
export const teamMembers = pgTable("team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  passHash: text("pass_hash").notNull(),
  admin: boolean("admin").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  /** When the password last changed (null = never since the account was made): sessions signed in before it end. */
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
})

// ── Cuentas por pagar / por cobrar (/interno/admin/cuentas-por-pagar, -por-cobrar) ──

export const payables = pgTable(
  "payables",
  {
    id: text("id").primaryKey(),
    payee: text("payee").notNull().default(""),
    category: text("category").notNull().default("otro"),
    amount: doublePrecision("amount").notNull().default(0),
    dueDate: text("due_date").notNull().default(""),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("payables_rev_idx").on(t.rev), index("payables_due_idx").on(t.dueDate)]
)
export const payableVersions = versions("payable_versions", "payable_id")

export const receivables = pgTable(
  "receivables",
  {
    id: text("id").primaryKey(),
    payer: text("payer").notNull().default(""),
    clientId: text("client_id").notNull().default(""),
    amount: doublePrecision("amount").notNull().default(0),
    dueDate: text("due_date").notNull().default(""),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("receivables_rev_idx").on(t.rev), index("receivables_due_idx").on(t.dueDate)]
)
export const receivableVersions = versions("receivable_versions", "receivable_id")

// ── Contratos (/interno/admin/legal/contratos) ──────────────────────────────

export const contracts = pgTable(
  "contracts",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull().default("otro"),
    title: text("title").notNull().default(""),
    endDate: text("end_date").notNull().default(""),
    data: jsonb("data").notNull(),
    ...shared(),
  },
  (t) => [index("contracts_rev_idx").on(t.rev), index("contracts_end_idx").on(t.endDate)]
)
export const contractVersions = versions("contract_versions", "contract_id")

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" })

/**
 * The signed copies of the contracts (owner, 2026-11-21: uploaded to the site): PDF or photos, at most
 * lib/contracts/files.ts MAX_BYTES each. The bytes go to the private Vercel Blob store (`blob_path`) when the host has
 * one, else here (`bytes`, local and dev); either way they're served only behind the /interno sign-in
 * (lib/contracts/storage.ts). Not synced to the phones (they're listed in the contract's record), not in the JSON backup.
 */
export const contractFiles = pgTable(
  "contract_files",
  {
    id: text("id").primaryKey(),
    contractId: text("contract_id").notNull(),
    name: text("name").notNull().default(""),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    bytes: bytea("bytes"),
    /** Pathname in the Blob store ("" = the bytes are in `bytes`). */
    blobPath: text("blob_path").notNull().default(""),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: text("uploaded_by").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("contract_files_contract_idx").on(t.contractId)]
)

// ── WispDavor (/interno/software/wispdavor) ─────────────────────────────────

/**
 * The client portal's private links (owner, 2026-11-21: "Private link"): one long random token per link, sent to the client
 * by WhatsApp; the portal page /mi-cuenta reads it from the address's #fragment (never sent in logs or referrers).
 * Revoked links stop working; a client can have a new one. The token is kept as is so reminders can include it.
 */
export const portalLinks = pgTable(
  "portal_links",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    seenCount: integer("seen_count").notNull().default(0),
  },
  (t) => [index("portal_links_client_idx").on(t.clientId)]
)

/** Every WhatsApp notice sent through the Cloud API (owner: "WhatsApp Cloud API"): who, which template, result. */
export const whatsappSends = pgTable(
  "whatsapp_sends",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    clientId: text("client_id").notNull().default(""),
    template: text("template").notNull(),
    phone: text("phone").notNull(),
    status: text("status").notNull(),
    messageId: text("message_id").notNull().default(""),
    error: text("error").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    sentBy: text("sent_by").notNull().default(""),
  },
  (t) => [index("whatsapp_sends_client_idx").on(t.clientId), index("whatsapp_sends_sent_idx").on(t.sentAt)]
)

/** WispDavor settings that aren't secrets (CFDI defaults…), one row per key; keys and secrets stay in the host's env. */
export const wispSettings = pgTable("wisp_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull().default(""),
})

/**
 * A client's Stripe customer (owner, 2026-11-21: Stripe for card, OXXO, SPEI and card auto-pay): the customer keeps the
 * client's SPEI CLABE and the saved card; `autopay` = charge the saved card on days 1, 5 and 9 (lib/wispdavor/online.ts).
 */
export const stripeCustomers = pgTable("stripe_customers", {
  clientId: text("client_id").primaryKey(),
  customerId: text("customer_id").notNull().unique(),
  autopay: boolean("autopay").notNull().default(false),
  paymentMethodId: text("payment_method_id").notNull().default(""),
  cardBrand: text("card_brand").notNull().default(""),
  cardLast4: text("card_last4").notNull().default(""),
  cardFunding: text("card_funding").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/** Every online payment started (Checkout) or charged (auto-pay), and what came of it; `paymentId` = the Cobranza record. */
export const onlinePayments = pgTable(
  "online_payments",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    kind: text("kind").notNull(),
    amount: doublePrecision("amount").notNull(),
    status: text("status").notNull(),
    paymentIntentId: text("payment_intent_id").notNull().default(""),
    paymentId: text("payment_id").notNull().default(""),
    error: text("error").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [index("online_payments_client_idx").on(t.clientId), index("online_payments_pi_idx").on(t.paymentIntentId)]
)

/** CFDIs issued through Facturama (owner: "Only who asks"), one per payment at most while active. */
export const cfdis = pgTable(
  "cfdis",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull(),
    paymentId: text("payment_id").notNull().default(""),
    uuid: text("uuid").notNull().default(""),
    serie: text("serie").notNull().default(""),
    folio: text("folio").notNull().default(""),
    total: doublePrecision("total").notNull(),
    receiverRfc: text("receiver_rfc").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [index("cfdis_client_idx").on(t.clientId), index("cfdis_payment_idx").on(t.paymentId)]
)

// ── WispDavor phase 3: routers, traffic, hotspot ─────────────────────────────

/**
 * A MikroTik that pulls its actions (owner, 2026-11-21: "Router pulls"): its own key (only the SHA-256 kept), the
 * deployment, what it does (PPPoE and/or common-area hotspot) and the automatic switch.
 */
export const routers = pgTable("routers", {
  id: text("id").primaryKey(),
  siteId: text("site_id").notNull().default(""),
  name: text("name").notNull(),
  pppoe: boolean("pppoe").notNull().default(true),
  hotspot: boolean("hotspot").notNull().default(false),
  auto: boolean("auto").notNull().default(false),
  /** How often its agent reports, in minutes: 2, 5 or 10 (owner, 2026-11-21: per router; new ones 5, fewer database wake-ups). */
  pollMinutes: integer("poll_minutes").notNull().default(5),
  /** The rate in the script pasted on the router (it changes only with a new script): what timing is measured against. */
  pollScript: integer("poll_script").notNull().default(5),
  keyHash: text("key_hash").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: text("created_by").notNull().default(""),
})

/** What a router last said it has: each PPPoE user (profile, disabled, connected) and its traffic counters. */
export const routerUsers = pgTable(
  "router_users",
  {
    routerId: text("router_id").notNull(),
    user: text("user").notNull(),
    profile: text("profile").notNull().default(""),
    disabled: boolean("disabled").notNull().default(false),
    active: boolean("active").notNull().default(false),
    rxLast: bigint("rx_last", { mode: "number" }).notNull().default(0),
    txLast: bigint("tx_last", { mode: "number" }).notNull().default(0),
    seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** Phase 4: the client's ONT answering the router's ping (latency in ms, loss 0–1, when); null = never pinged. */
    ontRtt: doublePrecision("ont_rtt"),
    ontLoss: doublePrecision("ont_loss"),
    ontAt: timestamp("ont_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("router_users_pk").on(t.routerId, t.user)]
)

/** Actions for a router, from staff or automatic; the router reports each one done or failed. */
export const routerActions = pgTable(
  "router_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    routerId: text("router_id").notNull(),
    kind: text("kind").notNull(),
    user: text("user").notNull().default(""),
    arg1: text("arg1").notNull().default(""),
    arg2: text("arg2").notNull().default(""),
    arg3: text("arg3").notNull().default(""),
    arg4: text("arg4").notNull().default(""),
    clientId: text("client_id").notNull().default(""),
    serviceId: text("service_id").notNull().default(""),
    source: text("source").notNull().default("staff"),
    status: text("status").notNull().default("pending"),
    result: text("result").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
  },
  (t) => [index("router_actions_router_idx").on(t.routerId, t.status)]
)

/** Traffic per PPPoE user: 5-minute buckets kept 7 days, then hourly kept 90 days (owner's choice). Bytes. */
export const traffic5m = pgTable(
  "traffic_5m",
  {
    routerId: text("router_id").notNull(),
    user: text("user").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    down: bigint("down", { mode: "number" }).notNull().default(0),
    up: bigint("up", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("traffic_5m_pk").on(t.routerId, t.user, t.bucket), index("traffic_5m_bucket_idx").on(t.bucket)]
)
export const trafficHourly = pgTable(
  "traffic_hourly",
  {
    routerId: text("router_id").notNull(),
    user: text("user").notNull(),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    down: bigint("down", { mode: "number" }).notNull().default(0),
    up: bigint("up", { mode: "number" }).notNull().default(0),
  },
  (t) => [uniqueIndex("traffic_hourly_pk").on(t.routerId, t.user, t.hour), index("traffic_hourly_hour_idx").on(t.hour)]
)

/** Common-area Wi-Fi vouchers (owner: plans and prices set in WispDavor); the plans live in wisp_settings ("hotspot"). */
export const vouchers = pgTable(
  "vouchers",
  {
    code: text("code").primaryKey(),
    password: text("password").notNull(),
    routerId: text("router_id").notNull(),
    planId: text("plan_id").notNull(),
    planName: text("plan_name").notNull(),
    price: doublePrecision("price"),
    status: text("status").notNull().default("pending"),
    uptime: text("uptime").notNull().default(""),
    bytes: bigint("bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
    soldAt: timestamp("sold_at", { withTimezone: true }),
  },
  (t) => [index("vouchers_router_idx").on(t.routerId, t.status)]
)

/**
 * WispDavor phase 4 (monitoring, owner 2026-11-21): per router and 5-minute bucket, the PPPoE sessions online and each
 * carrier gateway's ping ([{ip, sent, received, rtt}]). Kept 14 days.
 */
export const routerMetrics = pgTable(
  "router_metrics",
  {
    routerId: text("router_id").notNull(),
    bucket: timestamp("bucket", { withTimezone: true }).notNull(),
    online: integer("online"),
    gateways: jsonb("gateways").notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [uniqueIndex("router_metrics_pk").on(t.routerId, t.bucket), index("router_metrics_bucket_idx").on(t.bucket)]
)

/**
 * Outages (phase 4): a router's sessions dropping at once ("sesiones"), every carrier gateway unreachable ("carrier") or
 * the router no longer reporting ("router"). Open while ended_at is null; the team is alerted when one opens and ends,
 * and the clients of its deployment see a banner in their portal.
 */
export const outages = pgTable(
  "outages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    routerId: text("router_id").notNull(),
    siteId: text("site_id").notNull().default(""),
    kind: text("kind").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    baseline: integer("baseline").notNull().default(0),
    low: integer("low").notNull().default(0),
    detail: text("detail").notNull().default(""),
  },
  (t) => [index("outages_open_idx").on(t.siteId, t.endedAt), index("outages_router_idx").on(t.routerId, t.endedAt)]
)

/**
 * Field photos and client signatures (WispDavor phase 5, Técnico view): one row per file, for a job (an appointment or
 * a report). Kept like the contracts' files: in the private Blob store on the host (`campo/<ref>/<id>`), in `bytes`
 * without one; served only to a signed-in session.
 */
export const fieldFiles = pgTable(
  "field_files",
  {
    id: text("id").primaryKey(),
    refKind: text("ref_kind").notNull(),
    refId: text("ref_id").notNull(),
    kind: text("kind").notNull().default("foto"),
    name: text("name").notNull().default(""),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    bytes: bytea("bytes"),
    blobPath: text("blob_path").notNull().default(""),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: text("uploaded_by").notNull().default(""),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("field_files_ref_idx").on(t.refKind, t.refId)]
)

/**
 * How the site reaches a router's REST API (owner, 2026-11-21: "connect to the routers via the REST API" + "READ ONLY
 * mode"): address and port (a DDNS name such as Dynu, MikroTik's cloud name, or a VPN address), a read-only RouterOS
 * user (group "read", always used for reading) and an optional write user, their passwords encrypted with
 * ROUTER_CRED_KEY (never sent back), the router's certificate fingerprint when it isn't publicly trusted, and the
 * "Solo lectura" switch (on by default: no change is ever sent).
 */
export const routerRest = pgTable("router_rest", {
  routerId: text("router_id").primaryKey(),
  /** The connection mode (owner, 2026-11-21: a toggle): "rest" (www-ssl) or "api" (MikroTik API over api-ssl). */
  protocol: text("protocol").notNull().default("rest"),
  host: text("host").notNull().default(""),
  port: integer("port").notNull().default(443),
  apiPort: integer("api_port").notNull().default(8729),
  readUser: text("read_user").notNull().default(""),
  readPass: text("read_pass").notNull().default(""),
  writeUser: text("write_user").notNull().default(""),
  writePass: text("write_pass").notNull().default(""),
  fingerprint: text("fingerprint").notNull().default(""),
  readOnly: boolean("read_only").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull().default(""),
})

/** Copies of a router's configuration (/export over REST), the last 20 per router. */
export const routerBackups = pgTable(
  "router_backups",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    routerId: text("router_id").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").notNull().default(""),
    /** Phase 7: how it came ("rest" = Router en vivo, "agente" = sent by the router itself). */
    source: text("source").notNull().default("rest"),
    /** SHA-256 of the configuration without its date line: equal = no change since the copy before. */
    hash: text("hash").notNull().default(""),
    /** The last time the router sent the same configuration again (no new copy is kept for that). */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [index("router_backups_router_idx").on(t.routerId, t.createdAt)]
)

/**
 * Phase 7: a configuration on its way from a router, in pieces (fetch sends at most 64 KB per request, /file read gives
 * at most 32 KB): kept until the last piece arrives, then put together as one copy. Leftovers go after a day.
 */
export const routerBackupParts = pgTable(
  "router_backup_parts",
  {
    routerId: text("router_id").notNull(),
    upload: text("upload").notNull(),
    idx: integer("idx").notNull(),
    total: integer("total").notNull(),
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("router_backup_parts_pk").on(t.routerId, t.upload, t.idx)]
)
