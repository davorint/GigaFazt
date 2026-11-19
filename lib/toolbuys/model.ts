/**
 * Buying options for tools (/interno/admin/compras-herramientas, owner 2026-11-18: "options that we have when we want
 * to buy new stuff"; candidates with offers). One record is one candidate model for a need ("Fusionadora de fibra
 * óptica": Signal Fire AI-9, AI-20…), so the page groups them by need to compare. Each has several offers (store,
 * price with IVA, link, date), a priority and a status: idea → cotizado → aprobado → comprado / descartado. Marking it
 * bought fills the matching empty tool in Herramientas (quantity 0, same name), or adds a new one, and remembers it.
 *
 * Synced through the database (kind "toolbuys"). `decodeToolBuy` reads stored or synced values field by field and
 * never throws.
 */
import { safeUrl } from "../materials/catalog"
import { newId } from "../survey/id"
import { TOOL_CATEGORIES, newTool, type Tool, type ToolCategory } from "../tools/model"
import { TOOL_SPECS } from "../tools/specs"
import { decodeSpecs, decodeType, type Specs } from "../specs/engine"

export const BUY_STATUSES = ["idea", "cotizado", "aprobado", "comprado", "descartado"] as const
export type BuyStatus = (typeof BUY_STATUSES)[number]
export const PRIORITIES = ["alta", "media", "baja"] as const
export type Priority = (typeof PRIORITIES)[number]

export type BuyOffer = {
  id: string
  /** From /interno/admin/proveedores, or "" (then `store` says who). */
  supplierId: string
  store: string
  /** MXN per piece with IVA included; null = ask. */
  price: number | null
  url: string
  /** When the price was seen or quoted (yyyy-mm-dd). */
  date: string
  notes: string
}

export type ToolBuy = {
  id: string
  /** What it's for, e.g. "Fusionadora de fibra óptica" (the tool's name in Herramientas). */
  need: string
  category: ToolCategory
  brand: string
  model: string
  specs: string
  /** Tool type within the category (tools/specs.ts), "" = not said. */
  ptype: string
  /** Its characteristics: the type's fields with the values picked. */
  traits: Specs
  quantity: number
  priority: Priority
  status: BuyStatus
  offers: BuyOffer[]
  /** The offer to buy from ("" = the cheapest). */
  offerId: string
  /** The web listing it was loaded from (kept so a reload skips it), "" = typed by hand. */
  webKey: string
  /** The tool in Herramientas it filled or created when bought. */
  toolId: string
  notes: string
  by: string
  updatedAt: string
}

export const newBuyOffer = (p: Partial<BuyOffer> = {}): BuyOffer => ({ id: newId(), supplierId: "", store: "", price: null, url: "", date: "", notes: "", ...p })
export const newToolBuy = (p: Partial<ToolBuy> = {}): ToolBuy => ({
  id: newId(),
  need: "",
  category: "otros",
  brand: "",
  model: "",
  specs: "",
  ptype: "",
  traits: {},
  quantity: 1,
  priority: "media",
  status: "idea",
  offers: [],
  offerId: "",
  webKey: "",
  toolId: "",
  notes: "",
  by: "",
  updatedAt: "",
  ...p,
})

/** The offer it would be bought from: the chosen one, else the cheapest with a price, else the first. */
export function bestOffer(x: Pick<ToolBuy, "offers" | "offerId">): BuyOffer | null {
  const chosen = x.offerId ? x.offers.find((o) => o.id === x.offerId) : undefined
  if (chosen) return chosen
  const priced = x.offers.filter((o) => o.price !== null).sort((a, b) => a.price! - b.price!)
  return priced[0] ?? x.offers[0] ?? null
}

/** Total for the quantity at the best offer (null without a price). */
export const buyTotal = (x: ToolBuy) => {
  const o = bestOffer(x)
  return o?.price == null ? null : o.price * x.quantity
}

export const buyLabel = (x: Pick<ToolBuy, "need" | "brand" | "model">) => [x.brand, x.model].filter(Boolean).join(" ") || x.need || "Sin nombre"

/** Still to decide or to buy (not bought, not discarded). */
export const isOpen = (x: Pick<ToolBuy, "status">) => x.status !== "comprado" && x.status !== "descartado"

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()

/**
 * What marking it bought does to Herramientas: the tool to save (an empty one with the same name filled in, or a new
 * one) and the option updated (status comprado, linked to that tool). Purchase data from the chosen or cheapest offer.
 */
export function buyIntoTools(x: ToolBuy, tools: Tool[], today: string): { tool: Tool; option: ToolBuy } {
  const o = bestOffer(x)
  const purchase = { brand: x.brand, model: x.model, price: o?.price ?? null, supplierId: o?.supplierId ?? "", supplier: o?.supplierId ? "" : (o?.store ?? ""), purchaseDate: today }
  const empty = tools.find((t) => t.quantity === 0 && fold(t.name) === fold(x.need))
  const tool: Tool = empty
    ? { ...empty, ...purchase, quantity: Math.max(1, x.quantity) }
    : newTool({ name: x.need || buyLabel(x), category: x.category, quantity: Math.max(1, x.quantity), ...purchase })
  // The bought type and characteristics go to the tool: set when it has no type, filled in when it's the same type.
  if (x.ptype && tool.category === x.category && (!tool.ptype || tool.ptype === x.ptype)) Object.assign(tool, { ptype: x.ptype, traits: { ...(tool.ptype === x.ptype ? tool.traits : {}), ...x.traits } })
  return { tool, option: { ...x, status: "comprado", toolId: tool.id } }
}

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e8 ? v : null)
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : "")
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => ((list as readonly unknown[]).includes(v) ? (v as T) : fallback)

function decodeOffer(v: unknown): BuyOffer | null {
  if (!isObj(v)) return null
  return { id: id(v.id) || newId(), supplierId: id(v.supplierId), store: str(v.store, 200), price: money(v.price), url: safeUrl(v.url), date: date(v.date), notes: str(v.notes, 500) }
}

export function decodeToolBuy(v: unknown): ToolBuy | null {
  if (!isObj(v)) return null
  const offers = Array.isArray(v.offers) ? v.offers.slice(0, 30).map(decodeOffer).filter((x): x is BuyOffer => x !== null) : []
  const quantity = typeof v.quantity === "number" && Number.isFinite(v.quantity) && v.quantity >= 1 && v.quantity <= 10000 ? Math.round(v.quantity) : 1
  const category = pick(TOOL_CATEGORIES, v.category, "otros")
  const ptype = decodeType(TOOL_SPECS, category, v.ptype)
  return {
    id: id(v.id) || newId(),
    need: str(v.need, 200),
    category,
    brand: str(v.brand, 100),
    model: str(v.model, 150),
    specs: str(v.specs, 1000),
    ptype,
    traits: decodeSpecs(TOOL_SPECS, category, ptype, v.traits),
    quantity,
    priority: pick(PRIORITIES, v.priority, "media"),
    status: pick(BUY_STATUSES, v.status, "idea"),
    offers,
    offerId: offers.some((o) => o.id === v.offerId) ? (v.offerId as string) : "",
    webKey: str(v.webKey, 64),
    toolId: id(v.toolId),
    notes: str(v.notes, 2000),
    by: str(v.by, 100),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
