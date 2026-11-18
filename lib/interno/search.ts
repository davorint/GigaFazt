/**
 * One search box over everything the internal sections keep on the phone (owner, 2026-11-18): clients (name, phone,
 * PPPoE user, ONT serial, apartment), deployments, tools (name, serial, who has it), reports (code, name, phone),
 * providers (name, RFC, contacts), materials, surveys, notes and serialized units. Accents and case don't matter;
 * every word typed must appear. Each hit links to its record.
 */
import { clientLabel, type Client } from "../clients/model"
import type { Item } from "../materials/catalog"
import type { Note } from "../notes/model"
import { providerName, type Provider } from "../providers/model"
import { reportCode, type Report } from "../reports/model"
import { siteLabel, type Site } from "../sites/model"
import type { Unit } from "../stock/model"
import type { Survey } from "../survey/model"
import { toolLabel, type Tool } from "../tools/model"

export const SEARCH_KINDS = ["clients", "sites", "reports", "tools", "providers", "materials", "units", "surveys", "notes"] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]
export type Hit = { kind: SearchKind; id: string; label: string; detail: string; href: string }

export type SearchData = {
  clients: Client[]
  sites: Site[]
  reports: Report[]
  tools: Tool[]
  providers: Provider[]
  items: Item[]
  units: Unit[]
  surveys: Survey[]
  notes: Note[]
}

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
/** Phone numbers match without spaces or dashes ("55 1234-5678" finds "5512345678"). */
const digits = (s: string) => s.replace(/\D/g, "")

function matches(words: string[], text: string) {
  const hay = fold(text)
  const hayDigits = digits(text)
  return words.every((w) => hay.includes(w) || (/^\d{4,}$/.test(digits(w)) && hayDigits.includes(digits(w))))
}

const A = "/interno/admin"

export function searchAll(d: SearchData, q: string, limitPerKind = 8): Hit[] {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length || q.trim().length < 2) return []
  const out: Hit[] = []
  const add = <T>(kind: SearchKind, list: T[], text: (x: T) => string, hit: (x: T) => Omit<Hit, "kind">) => {
    let n = 0
    for (const x of list) {
      if (n >= limitPerKind) break
      if (matches(words, text(x))) {
        out.push({ kind, ...hit(x) })
        n++
      }
    }
  }
  const siteName = (id: string) => {
    const s = d.sites.find((x) => x.id === id)
    return s ? siteLabel(s) : ""
  }
  add(
    "clients",
    d.clients,
    (c) => [c.name, c.phone, c.whatsapp, c.email, c.building, c.tower, c.apartment, ...c.contacts.flatMap((x) => [x.name, x.phone]), ...c.services.flatMap((s) => [s.plan, s.pppoeUser, s.ontSn])].join(" "),
    (c) => ({ id: c.id, label: clientLabel(c), detail: [c.phone, siteName(c.siteId) || c.building, [c.tower, c.apartment].filter(Boolean).join(" ")].filter(Boolean).join(" · "), href: `${A}/clientes?c=${c.id}` })
  )
  add(
    "sites",
    d.sites,
    (s) => [s.name, s.address, s.municipality, ...s.rooms.flatMap((r) => [r.name, ...r.equipment.flatMap((e) => [e.model, e.serial, e.ip])])].join(" "),
    (s) => ({ id: s.id, label: siteLabel(s), detail: [s.address, s.municipality].filter(Boolean).join(" · "), href: `${A}/despliegues?d=${s.id}` })
  )
  add(
    "reports",
    d.reports,
    (r) => [reportCode(r), r.name, r.phone, r.address, r.description, r.assignee].join(" "),
    (r) => ({ id: r.id, label: [reportCode(r), r.name].filter(Boolean).join(" · "), detail: [r.phone, r.createdAt.slice(0, 10)].filter(Boolean).join(" · "), href: `${A}/reportes_clientes?r=${r.id}` })
  )
  add(
    "tools",
    d.tools,
    (x) => [x.name, x.brand, x.model, x.serial, x.holder, x.notes].join(" "),
    (x) => ({ id: x.id, label: toolLabel(x), detail: [x.serial, x.holder || siteName(x.siteId)].filter(Boolean).join(" · "), href: `${A}/herramientas?h=${x.id}` })
  )
  add(
    "providers",
    d.providers,
    (p) => [p.tradeName, p.legalName, p.rfc, p.notes, ...p.contacts.flatMap((c) => [c.name, c.phone, c.email])].join(" "),
    (p) => ({ id: p.id, label: providerName(p) || "—", detail: p.rfc, href: `${A}/proveedores?p=${p.id}` })
  )
  add(
    "materials",
    d.items,
    (x) => [x.name, x.sku, x.notes, ...x.offers.map((o) => o.sku)].join(" "),
    (x) => ({ id: x.id, label: x.name, detail: x.unit, href: `${A}/materiales?m=${x.id}` })
  )
  add(
    "units",
    d.units,
    (u) => u.serial,
    (u) => {
      const item = d.items.find((x) => x.id === u.itemId)
      const client = d.clients.find((c) => c.id === u.clientId)
      return { id: u.id, label: u.serial, detail: [item?.name, client ? clientLabel(client) : ""].filter(Boolean).join(" · "), href: client ? `${A}/clientes?c=${client.id}` : `${A}/materiales?t=equipos` }
    }
  )
  add(
    "surveys",
    d.surveys,
    (s) => [s.ident.name, s.ident.address, s.ident.municipality].join(" "),
    (s) => ({ id: s.id, label: s.ident.name || "—", detail: s.ident.address, href: `/interno/levantamientos?l=${s.id}` })
  )
  add(
    "notes",
    d.notes,
    (n) => [n.title, n.body, n.by].join(" "),
    (n) => ({ id: n.id, label: n.title || n.body.slice(0, 60), detail: n.by, href: `${A}/notas` })
  )
  return out
}
