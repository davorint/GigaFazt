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

export type Item = {
  id: string
  name: string
  category: Category
  unit: string
  /** MXN with IVA included; null = no price yet. */
  price: number | null
  role: Role | ""
  /** The provider from /interno/admin/proveedores, or "". */
  supplierId: string
  /** Free-text supplier when it isn't in the list. */
  supplier: string
  sku: string
  notes: string
}

/** Starter ids are fixed (from the role, or the name), so every browser's starter list has the same ids. */
const starterId = (name: string, role: Role | "") =>
  `starter-${role || name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`.slice(0, 64)
const item = (name: string, category: Category, unit: string, role: Role | "" = ""): Item => ({ id: starterId(name, role), name, category, unit, price: null, role, supplierId: "", supplier: "", sku: "", notes: "" })

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

export function decodeItem(v: unknown): Item | null {
  if (!isObj(v) || typeof v.name !== "string") return null
  return {
    id: typeof v.id === "string" && /^[\w-]{6,64}$/.test(v.id) ? v.id : newId(),
    name: str(v.name, 200),
    category: (CATEGORIES as readonly unknown[]).includes(v.category) ? (v.category as Category) : "otros",
    unit: str(v.unit, 20) || "pza",
    price: typeof v.price === "number" && Number.isFinite(v.price) && v.price >= 0 && v.price <= 1e8 ? v.price : null,
    role: (ROLES as readonly unknown[]).includes(v.role) ? (v.role as Role) : "",
    supplierId: typeof v.supplierId === "string" && /^[\w-]{6,64}$/.test(v.supplierId) ? v.supplierId : "",
    supplier: str(v.supplier, 200),
    sku: str(v.sku, 100),
    notes: str(v.notes, 1000),
  }
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
