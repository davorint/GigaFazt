/**
 * The master materials list (/interno/admin/materiales, owner 2026-11-17: "the main materials section under /interno… from
 * there we will pick and choose the materials that we need for each project… like the master list"). Each item: name,
 * category, unit, price with IVA included (owner's choice), supplier, part number, notes, and optionally what it's for
 * in a design (`role`: a 1:16 splitter, a 10/90 tap, riser fiber per meter, a floor box, the ONT…), which is how a site
 * survey knows which item fills each need of its design. Saved in this browser and shared as a file, like the surveys;
 * every item has its own id for the Postgres move later.
 *
 * The starting list is the usual FTTH material of the owner's design (drop and riser fiber, PLC splitters, FBT taps,
 * floor boxes, connectors and splices, the EG8145B7-50 ONT, labor) without prices: the owner fills them in.
 */
import { newId } from "../survey/id"
import { SPLIT_RATIOS, TAP_RATIOS } from "../survey/design"
import { decodeFiber, emptyFiber, type FiberSpec } from "./fiber"

export const CATEGORIES = ["fibra", "splitters", "cajas", "conectores", "ont", "equipo", "wifi", "obra", "otros"] as const
export type Category = (typeof CATEGORIES)[number]

/** What an item is for in a design. Build: once per deployment. Client: once per apartment that signs up. */
export const ROLES = [
  ...SPLIT_RATIOS.map((r) => `splitter-${r}` as const),
  ...TAP_RATIOS.map((p) => `tap-${p}` as const),
  "riser-m",
  "feeder-m",
  "floor-box",
  "base-box",
  "splice",
  "connector",
  "olt-patch",
  "drop-m",
  "ont",
  "client-connector",
  "client-labor",
] as const
export type Role = (typeof ROLES)[number]
export const CLIENT_ROLES: Role[] = ["drop-m", "ont", "client-connector", "client-labor"]

/** An offer's state (owner, 2026-11-18, Compras de materiales): agotada / descartada ones are kept but never priced. */
export const OFFER_STATUSES = ["vigente", "agotada", "descartada"] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

/** Who sells an item and at what price (owner, 2026-11-18: several suppliers per material, a price each). */
export type Offer = {
  id: string
  /** The provider from /interno/admin/proveedores, or "" (then `supplier` says who). */
  supplierId: string
  supplier: string
  /** MXN with IVA included; null = ask. */
  price: number | null
  /** When that price was quoted (yyyy-mm-dd). */
  date: string
  sku: string
  notes: string
  /** The store's page for it (http/https), "" = none. */
  url: string
  status: OfferStatus
}

export type Item = {
  id: string
  name: string
  category: Category
  unit: string
  /**
   * The price, supplier and part number used everywhere (survey costs, Proveedores): those of the chosen offer
   * (`offerId`), else the cheapest priced one. Kept in step with `offers` by `withEffective`; MXN with IVA.
   */
  price: number | null
  role: Role | ""
  supplierId: string
  supplier: string
  sku: string
  notes: string
  offers: Offer[]
  /** The offer to buy from ("" = the cheapest). */
  offerId: string
  /** Warn when the warehouse has fewer than this (null = no warning). */
  minStock: number | null
  /** Tracked one by one by serial number (ONTs and other loaned equipment). */
  serialized: boolean
  /** Fiber and cable items: mode, grade, cable type, indoor or outdoor, strands… (all optional). */
  fiber: FiberSpec
}

export const newOffer = (p: Partial<Offer> = {}): Offer => ({ id: newId(), supplierId: "", supplier: "", price: null, date: "", sku: "", notes: "", url: "", status: "vigente", ...p })

/** A store link worth opening: http(s) only, else "". */
export function safeUrl(v: unknown): string {
  if (typeof v !== "string" || v.length > 500) return ""
  try {
    const u = new URL(v.trim())
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : ""
  } catch {
    return ""
  }
}

/**
 * The offer an item's price comes from: the chosen one, else the cheapest current (vigente) one with a price, else the
 * first current one. Sold-out and discarded offers only count when chosen on purpose.
 */
export function effectiveOffer(it: Pick<Item, "offers" | "offerId">): Offer | null {
  const chosen = it.offerId ? it.offers.find((o) => o.id === it.offerId) : undefined
  if (chosen) return chosen
  const live = it.offers.filter((o) => o.status === "vigente")
  const priced = live.filter((o) => o.price !== null).sort((a, b) => a.price! - b.price!)
  return priced[0] ?? live[0] ?? null
}

/** The item with its price, supplier and part number taken from its offers (no offers: no price, no supplier). */
export function withEffective(it: Item): Item {
  const o = effectiveOffer(it)
  return { ...it, price: o?.price ?? null, supplierId: o?.supplierId ?? "", supplier: o?.supplier ?? "", sku: o?.sku ?? "" }
}

/** The item's offer from a provider, if it has one. */
export const offerFrom = (it: Item, providerId: string) => it.offers.find((o) => o.supplierId === providerId)

/** A new item. */
export const newItem = (p: Partial<Item> = {}): Item => ({ id: newId(), name: "", category: "otros", unit: "pza", price: null, role: "", supplierId: "", supplier: "", sku: "", notes: "", offers: [], offerId: "", minStock: null, serialized: false, fiber: emptyFiber(), ...p })

/** Starter ids are fixed (from the role, or the name), so every browser's starter list has the same ids. */
const starterId = (name: string, role: Role | "") =>
  `starter-${role || name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 64)
const item = (name: string, category: Category, unit: string, role: Role | "" = ""): Item => ({ id: starterId(name, role), name, category, unit, price: null, role, supplierId: "", supplier: "", sku: "", notes: "", offers: [], offerId: "", minStock: null, serialized: role === "ont", fiber: emptyFiber() })

/** The first list, without prices (fixed ids). */
export function starterCatalog(): Item[] {
  return [
    item("Cable de fibra drop 1 hilo (acometida)", "fibra", "m", "drop-m"),
    item("Cable de fibra para el ducto (riser)", "fibra", "m", "riser-m"),
    item("Cable de fibra del cuarto a la base del ducto", "fibra", "m", "feeder-m"),
    ...SPLIT_RATIOS.map((r) => item(`Splitter PLC 1:${r} SC/APC`, "splitters", "pza", `splitter-${r}` as Role)),
    ...TAP_RATIOS.map((p) => item(`Splitter desbalanceado FBT ${p}/${100 - p}`, "splitters", "pza", `tap-${p}` as Role)),
    item("Caja de distribución de piso (NAP)", "cajas", "pza", "floor-box"),
    item("Caja o gabinete de la base del ducto", "cajas", "pza", "base-box"),
    item("Empalme por fusión (manguito protector)", "conectores", "pza", "splice"),
    item("Conector SC/APC (pigtail o rápido)", "conectores", "pza", "connector"),
    item("Patch cord SC/APC de la OLT al ODF", "conectores", "pza", "olt-patch"),
    item("Conector rápido SC/APC para el cliente", "conectores", "pza", "client-connector"),
    item("ONT Huawei EG8145B7-50", "ont", "pza", "ont"),
    item("Instalación por cliente (mano de obra)", "obra", "servicio", "client-labor"),
    item("Mano de obra del despliegue", "obra", "día"),
    item("Canaleta o tubería", "otros", "m"),
    item("Access point Wi-Fi para áreas comunes", "wifi", "pza"),
  ]
}

// ── Reading stored or imported values ───────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

const okId = (v: unknown) => typeof v === "string" && /^[\w-]{6,64}$/.test(v)
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e8 ? v : null)

function decodeOffer(v: unknown): Offer | null {
  if (!isObj(v)) return null
  return {
    id: okId(v.id) ? (v.id as string) : newId(),
    supplierId: okId(v.supplierId) ? (v.supplierId as string) : "",
    supplier: str(v.supplier, 200),
    price: money(v.price),
    date: typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : "",
    sku: str(v.sku, 100),
    notes: str(v.notes, 500),
    url: safeUrl(v.url),
    status: (OFFER_STATUSES as readonly unknown[]).includes(v.status) ? (v.status as OfferStatus) : "vigente",
  }
}

export function decodeItem(v: unknown): Item | null {
  if (!isObj(v) || typeof v.name !== "string") return null
  const id = okId(v.id) ? (v.id as string) : newId()
  const role = (ROLES as readonly unknown[]).includes(v.role) ? (v.role as Role) : ""
  // Items saved before offers existed: their one price and supplier become the first offer (fixed id, so it's stable).
  const legacy = !Array.isArray(v.offers) && (money(v.price) !== null || okId(v.supplierId) || !!str(v.supplier, 200) || !!str(v.sku, 100))
  const offers: Offer[] = Array.isArray(v.offers)
    ? v.offers.slice(0, 30).map(decodeOffer).filter((x): x is Offer => x !== null)
    : legacy
      ? [{ id: id.slice(0, 56) + "-of1", supplierId: okId(v.supplierId) ? (v.supplierId as string) : "", supplier: str(v.supplier, 200), price: money(v.price), date: "", sku: str(v.sku, 100), notes: "", url: "", status: "vigente" }]
      : []
  const offerId = okId(v.offerId) && offers.some((o) => o.id === v.offerId) ? (v.offerId as string) : ""
  const minStock = typeof v.minStock === "number" && Number.isFinite(v.minStock) && v.minStock >= 0 && v.minStock <= 1e6 ? v.minStock : null
  return withEffective({
    id,
    name: str(v.name, 200),
    category: (CATEGORIES as readonly unknown[]).includes(v.category) ? (v.category as Category) : "otros",
    unit: str(v.unit, 20) || "pza",
    price: null,
    role,
    supplierId: "",
    supplier: "",
    sku: "",
    notes: str(v.notes, 1000),
    offers,
    offerId,
    minStock,
    serialized: typeof v.serialized === "boolean" ? v.serialized : role === "ont",
    fiber: decodeFiber(v.fiber),
  })
}

export const CATALOG_FILE = "gigafazt-materiales"
export const catalogFile = (items: Item[]) => JSON.stringify({ type: CATALOG_FILE, v: 1, exportedAt: new Date().toISOString(), items }, null, 2)

/** Items in an exported list; null when the text isn't one of our files. */
export function readCatalogFile(text: string): Item[] | null {
  try {
    const v = JSON.parse(text) as unknown
    if (!isObj(v) || v.type !== CATALOG_FILE || !Array.isArray(v.items)) return null
    return v.items.map(decodeItem).filter((x): x is Item => x !== null)
  } catch {
    return null
  }
}

/**
 * Items from a file into the list: new ids are added; an item already here takes the file's values only when
 * `replace` (importing a list on purpose), never when items arrive with a survey (they only fill what's missing).
 */
export function mergeItems(saved: Item[], incoming: Item[], replace: boolean): { list: Item[]; added: number; replaced: number } {
  const out = [...saved]
  let added = 0
  let replaced = 0
  for (const it of incoming) {
    const k = out.findIndex((x) => x.id === it.id)
    if (k < 0) {
      out.push(it)
      added++
    } else if (replace || (out[k].price === null && it.price !== null)) {
      // Arriving with a survey only fills what's missing: an item without a price here takes the incoming one.
      out[k] = it
      replaced++
    }
  }
  return { list: out, added, replaced }
}

/** "$1,234.50" in MXN. */
export const mxn = (v: number) => v.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
