/**
 * Providers (/interno/admin/proveedores, owner 2026-11-17): everyone the company buys from or works with, kept for
 * reference and used by other sections: material and equipment suppliers (the master materials list picks each item's
 * supplier), carriers (the surveys' Carriers section and each link of a MikroTik deployment name theirs), services and
 * contractors, and anything else. A provider can be several kinds at once.
 *
 * Saved in this browser and shared as a file until the Postgres database (its own table there, with history); every
 * provider and contact has its own id. `decodeProvider` reads stored or imported values field by field, never throws.
 */
import { newId } from "../survey/id"

export const PROVIDER_KINDS = ["material", "carrier", "service", "other"] as const
export type ProviderKind = (typeof PROVIDER_KINDS)[number]

export type ProviderContact = { id: string; name: string; role: string; phone: string; whatsapp: string; email: string }
export type CarrierOffer = { id: string; mbps: number | null; monthly: number | null; notes: string }
/** 1–5 or not rated. */
export type Score = 1 | 2 | 3 | 4 | 5 | null

export type Provider = {
  id: string
  kinds: ProviderKind[]
  tradeName: string
  legalName: string
  rfc: string
  website: string
  contacts: ProviderContact[]
  terms: { creditDays: number | null; deliveryDays: number | null; minOrder: string; warranty: string; shipping: string; bank: string }
  rating: { quality: Score; response: Score; price: Score }
  notes: string
  /** Catalogs, price lists, contracts (links). */
  docs: string
  carrier: { zones: string; offers: CarrierOffer[]; ip: "publica" | "nat" | "ambas" | ""; installDays: number | null; sla: string; support: string }
  updatedAt: string
}

export function newProvider(kind: ProviderKind = "material", name = ""): Provider {
  return {
    id: newId(),
    kinds: [kind],
    tradeName: name,
    legalName: "",
    rfc: "",
    website: "",
    contacts: [],
    terms: { creditDays: null, deliveryDays: null, minOrder: "", warranty: "", shipping: "", bank: "" },
    rating: { quality: null, response: null, price: null },
    notes: "",
    docs: "",
    carrier: { zones: "", offers: [], ip: "", installDays: null, sla: "", support: "" },
    updatedAt: new Date().toISOString(),
  }
}

/** Mexican RFC: 3 letters (company) or 4 (person), date YYMMDD, 3-character homoclave. */
export const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/

export const isKind = (p: Provider, k: ProviderKind) => p.kinds.includes(k)
export const providerName = (p: Provider) => p.tradeName.trim() || p.legalName.trim()

// ── Reading stored or imported values ───────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null)
const okId = (v: unknown) => (typeof v === "string" && /^[\w-]{6,64}$/.test(v) ? v : newId())
const score = (v: unknown): Score => (typeof v === "number" && [1, 2, 3, 4, 5].includes(v) ? (v as Score) : null)

export function decodeProvider(v: unknown): Provider | null {
  if (!isObj(v)) return null
  const kinds = Array.isArray(v.kinds) ? [...new Set(v.kinds.filter((k): k is ProviderKind => (PROVIDER_KINDS as readonly unknown[]).includes(k)))] : []
  const t = isObj(v.terms) ? v.terms : {}
  const r = isObj(v.rating) ? v.rating : {}
  const c = isObj(v.carrier) ? v.carrier : {}
  return {
    id: okId(v.id),
    kinds: kinds.length ? kinds : ["other"],
    tradeName: str(v.tradeName, 200),
    legalName: str(v.legalName, 300),
    rfc: str(v.rfc, 13).toUpperCase(),
    website: str(v.website, 300),
    contacts: (Array.isArray(v.contacts) ? v.contacts : []).filter(isObj).slice(0, 30).map((x) => ({
      id: okId(x.id),
      name: str(x.name, 200),
      role: str(x.role, 100),
      phone: str(x.phone, 50),
      whatsapp: str(x.whatsapp, 50),
      email: str(x.email, 200),
    })),
    terms: {
      creditDays: num(t.creditDays, 0, 365),
      deliveryDays: num(t.deliveryDays, 0, 365),
      minOrder: str(t.minOrder, 300),
      warranty: str(t.warranty, 300),
      shipping: str(t.shipping, 300),
      bank: str(t.bank, 500),
    },
    rating: { quality: score(r.quality), response: score(r.response), price: score(r.price) },
    notes: str(v.notes, 4000),
    docs: str(v.docs, 2000),
    carrier: {
      zones: str(c.zones, 1000),
      offers: (Array.isArray(c.offers) ? c.offers : []).filter(isObj).slice(0, 30).map((x) => ({ id: okId(x.id), mbps: num(x.mbps, 0, 1e6), monthly: num(x.monthly, 0, 1e8), notes: str(x.notes, 300) })),
      ip: (["publica", "nat", "ambas", ""] as const).find((x) => x === c.ip) ?? "",
      installDays: num(c.installDays, 0, 3650),
      sla: str(c.sla, 300),
      support: str(c.support, 300),
    },
    updatedAt: typeof v.updatedAt === "string" && /^\d{4}-\d{2}-\d{2}/.test(v.updatedAt) ? v.updatedAt.slice(0, 30) : new Date().toISOString(),
  }
}

export const PROVIDERS_FILE = "gigafazt-proveedores"
export const providersFile = (list: Provider[]) => JSON.stringify({ type: PROVIDERS_FILE, v: 1, exportedAt: new Date().toISOString(), providers: list }, null, 2)

export function readProvidersFile(text: string): Provider[] | null {
  try {
    const v = JSON.parse(text) as unknown
    if (!isObj(v) || v.type !== PROVIDERS_FILE || !Array.isArray(v.providers)) return null
    return v.providers.map(decodeProvider).filter((x): x is Provider => x !== null)
  } catch {
    return null
  }
}

/** A file into the list: new ids added; the same id replaced only by an equal or newer copy. */
export function mergeProviders(saved: Provider[], incoming: Provider[]): { list: Provider[]; added: number; replaced: number; kept: number } {
  const out = [...saved]
  let added = 0
  let replaced = 0
  let kept = 0
  for (const p of incoming) {
    const k = out.findIndex((x) => x.id === p.id)
    if (k < 0) {
      out.push(p)
      added++
    } else if (p.updatedAt >= out[k].updatedAt) {
      out[k] = p
      replaced++
    } else kept++
  }
  return { list: out, added, replaced, kept }
}
