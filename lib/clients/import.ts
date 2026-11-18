/**
 * Getting the current subscribers in (owner, 2026-11-17: "give me the option to do either"):
 * - a spreadsheet: CSV, or rows pasted straight from Excel / Google Sheets (tabs), with a header row or not; each
 *   column is matched to a field (guessed from the header, changeable), values converted (dates dd/mm/aaaa or
 *   aaaa-mm-dd, "$1,234.50", sí/no), and every line with a problem listed before anything is saved;
 *   A row gives one client with an internet service (when it has internet columns), an IPTV service (TV column "sí",
 *   a TV package or price, or a client of type TV) or both;
 * - the MikroTik: `/ppp secret export` (or `export terse`): each account becomes a client with an internet service
 *   (PPPoE user, profile as the plan, suspended when the account is disabled or on DSX-suspendido), the comment as the
 *   name.
 * Matching with the clients already there is done by mergeClients (model.ts): known clients only get empty fields
 * filled.
 */
import { CLIENT_KINDS, PAY_METHODS, clientStatus, newClient, newService, type Client, type ClientKind, type PayMethod, type Service, type ServiceStatus } from "./model"

/** Fields a spreadsheet column can fill. */
export const IMPORT_FIELDS = [
  "kind",
  "name",
  "phone",
  "whatsapp",
  "email",
  "building",
  "tower",
  "apartment",
  "plan",
  "installDate",
  "monthly",
  "status",
  "ontModel",
  "ontSn",
  "pppoeUser",
  "deployment",
  "oltPort",
  "ontId",
  "tv",
  "tvPackage",
  "tvMonthly",
  "payDay",
  "payMethod",
  "notes",
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** Header words that point to each field (Spanish and English, as people name their columns). */
const ALIASES: Record<ImportField, string[]> = {
  kind: ["tipo", "tipo de cliente", "segmento", "kind", "client type"],
  name: ["nombre", "cliente", "name", "nombre completo", "titular"],
  phone: ["telefono", "tel", "celular", "phone", "movil"],
  whatsapp: ["whatsapp", "wa", "whats"],
  email: ["correo", "email", "e mail", "mail"],
  building: ["edificio", "condominio", "desarrollo", "building", "torre edificio", "conjunto"],
  tower: ["torre", "tower", "bloque"],
  apartment: ["departamento", "depto", "dpto", "apartment", "apt", "unidad", "numero interior", "interior"],
  plan: ["plan", "plan internet", "perfil", "profile", "velocidad"],
  tv: ["tv", "television", "iptv"],
  tvPackage: ["paquete tv", "paquete de tv", "paquete iptv", "tv package"],
  tvMonthly: ["mensualidad de tv", "mensualidad tv", "precio tv", "cuota tv", "tv monthly", "tv precio"],
  installDate: ["instalacion", "fecha instalacion", "fecha de instalacion", "alta", "fecha alta", "install date"],
  monthly: ["mensualidad", "precio", "renta", "cuota", "monto", "monthly", "pago mensual"],
  status: ["estado", "estatus", "status"],
  ontModel: ["modelo ont", "modelo", "ont model", "equipo"],
  ontSn: ["serie", "sn", "numero de serie", "serial", "ont sn", "sn ont"],
  pppoeUser: ["usuario", "pppoe", "usuario pppoe", "user", "login", "cuenta"],
  deployment: ["despliegue", "red", "nodo", "deployment"],
  oltPort: ["puerto", "puerto olt", "pon", "olt port"],
  ontId: ["ont id", "id ont", "id del ont", "onu id", "id de la onu"],
  payDay: ["dia de pago", "dia pago", "corte", "pay day"],
  payMethod: ["forma de pago", "metodo de pago", "pago", "pay method"],
  notes: ["notas", "observaciones", "comentarios", "notes", "comentario"],
}

export function guessField(header: string): ImportField | "" {
  const h = fold(header)
  if (!h) return ""
  for (const f of IMPORT_FIELDS) if (ALIASES[f].includes(h)) return f
  // Otherwise the field whose name appears in the title, the longest name first ("mensualidad de tv" before "mensualidad").
  let best: ImportField | "" = ""
  let len = 0
  for (const f of IMPORT_FIELDS)
    for (const a of ALIASES[f])
      if (a.length > 3 && a.length > len && h.includes(a)) {
        best = f
        len = a.length
      }
  return best
}

/** Rows of a CSV / TSV text (quoted cells with commas, quotes and line breaks inside are understood). */
export function parseTable(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")
  const first = t.split("\n").find((l) => l.trim()) ?? ""
  const sep = first.includes("\t") ? "\t" : (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === "") quoted = true
    else if (ch === sep) {
      row.push(cell.trim())
      cell = ""
    } else if (ch === "\n") {
      row.push(cell.trim())
      if (row.some((c) => c)) rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  row.push(cell.trim())
  if (row.some((c) => c)) rows.push(row)
  return rows.slice(0, 5000)
}

/** The first row is a header when at least two of its cells name a field. */
export const hasHeader = (rows: string[][]) => (rows[0] ?? []).filter((c) => guessField(c)).length >= 2

const yes = (v: string) => ["si", "sí", "s", "yes", "y", "x", "1", "true", "con tv", "tv"].includes(v.trim().toLowerCase())

/** "15/03/2025", "15-03-25", "2025-03-15" → "2025-03-15"; "" when it isn't a date. */
export function toDate(v: string): string {
  const s = v.trim()
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return valid(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (m) return valid(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1])
  return ""
}
function valid(y: number, mo: number, d: number): string {
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1990 || y > 2100) return ""
  return dt.toISOString().slice(0, 10)
}
/** "$1,234.50", "1234,50", "596" → number; null when it isn't one. */
export function toMoney(v: string): number | null {
  const s = v.replace(/[$\s]|mxn/gi, "")
  if (!s) return null
  // A comma before the last 1–2 digits is the decimal mark ("1234,50", "1.234,50"); otherwise commas are thousands.
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "")
  const n = Number(normalized)
  return Number.isFinite(n) && n >= 0 && n <= 1e6 ? Math.round(n * 100) / 100 : null
}
function toKind(v: string): ClientKind | null {
  const f = fold(v)
  if (!f) return null
  if (/^(resid|depto|departamento|casa|hogar|home)/.test(f)) return "residencial"
  if (/^(admin|condominio|torre|edificio)/.test(f)) return "administracion"
  if (/^(empresa|negocio|oficina|comerc|company|business)/.test(f)) return "empresa"
  if (/^(tv|iptv|television)/.test(f)) return "tv"
  return (CLIENT_KINDS as readonly string[]).includes(f) ? (f as ClientKind) : null
}
function toStatus(v: string): ServiceStatus | null {
  const f = fold(v)
  if (!f) return null
  if (/^(activo|active|alta|ok|si)/.test(f)) return "activo"
  if (/^(suspend|corte|cortado|moroso|bloque)/.test(f)) return "suspendido"
  if (/^(cancel|baja|inactivo|retir)/.test(f)) return "cancelado"
  return null
}
function toMethod(v: string): PayMethod | null {
  const f = fold(v)
  if (!f) return ""
  if (f.startsWith("efect") || f === "cash") return "efectivo"
  if (f.startsWith("transf") || f.includes("spei")) return "transferencia"
  if (f.startsWith("tarj") || f.includes("card")) return "tarjeta"
  if (f.startsWith("depos")) return "deposito"
  return (PAY_METHODS as readonly string[]).includes(f) ? (f as PayMethod) : "otro"
}

export type RowError = { line: number; field: ImportField | "row"; value: string }

/** Fields that say a row has an internet service with us. */
const NET_ONLY: ImportField[] = ["pppoeUser", "ontSn", "deployment", "oltPort", "ontId"]
/** Fields that belong to the row's main service (internet, or IPTV for a TV client without internet). */
const MAIN: ImportField[] = ["plan", "installDate", "monthly", "status"]

/**
 * The clients of a table with its column → field mapping; lines with problems listed (and still imported without the
 * bad value). A row gives an internet service when it has internet columns (or a plan or price and isn't a TV client)
 * and an IPTV service when it says TV, has a TV package or price, or is a TV client.
 */
export function rowsToClients(rows: string[][], mapping: (ImportField | "")[], skipHeader: boolean): { clients: Client[]; errors: RowError[] } {
  const clients: Client[] = []
  const errors: RowError[] = []
  rows.forEach((r, k) => {
    if (skipHeader && k === 0) return
    const line = k + 1
    const v: Partial<Record<ImportField, string>> = {}
    mapping.forEach((f, i) => {
      const x = (r[i] ?? "").trim()
      if (f && x && !v[f]) v[f] = x
    })
    const bad = (field: ImportField) => errors.push({ line, field, value: v[field] ?? "" })
    const c = newClient()
    if (v.kind) {
      const kind = toKind(v.kind)
      if (kind) c.kind = kind
      else bad("kind")
    }
    for (const f of ["name", "phone", "whatsapp", "email", "building", "tower", "apartment", "notes"] as const) if (v[f]) c[f] = v[f].slice(0, f === "notes" ? 4000 : 200)
    if (v.payDay) {
      const n = Number(v.payDay)
      if (Number.isInteger(n) && n >= 1 && n <= 31) c.payDay = n
      else bad("payDay")
    }
    if (v.payMethod) c.payMethod = toMethod(v.payMethod) ?? ""
    // The main service's values
    const main: Partial<Service> = {}
    if (v.plan) main.plan = v.plan.slice(0, 120)
    if (v.installDate) {
      const d = toDate(v.installDate)
      if (d) main.start = d
      else bad("installDate")
    }
    if (v.monthly) {
      const n = toMoney(v.monthly)
      if (n !== null) main.monthly = n
      else bad("monthly")
    }
    if (v.status) {
      const st = toStatus(v.status)
      if (st) main.status = st
      else bad("status")
    }
    const hasNet = NET_ONLY.some((f) => v[f]) || (c.kind !== "tv" && MAIN.some((f) => f !== "status" && v[f]))
    const tvYes = v.tv ? yes(v.tv) : false
    const hasTv = tvYes || !!v.tvPackage || !!v.tvMonthly || c.kind === "tv"
    if (hasNet) {
      const net = newService("internet", { ...main, ontModel: v.ontModel?.slice(0, 60) ?? "" })
      if (v.ontSn) net.ontSn = v.ontSn.toUpperCase().slice(0, 40)
      if (v.pppoeUser) net.pppoeUser = v.pppoeUser.slice(0, 64)
      if (v.deployment) net.deployment = v.deployment.slice(0, 120)
      if (v.oltPort) net.oltPort = v.oltPort.slice(0, 20)
      if (v.ontId) {
        const n = Number(v.ontId)
        if (Number.isInteger(n) && n >= 0 && n <= 255) net.ontId = n
        else bad("ontId")
      }
      c.services.push(net)
    }
    if (hasTv) {
      const tv = newService("iptv", hasNet ? { status: main.status ?? "activo", start: main.start ?? "" } : main)
      if (v.tvPackage) tv.plan = v.tvPackage.slice(0, 120)
      if (v.tvMonthly) {
        const n = toMoney(v.tvMonthly)
        if (n !== null) tv.monthly = n
        else bad("tvMonthly")
      }
      c.services.push(tv)
    }
    if (!c.name && !c.services.some((s) => s.pppoeUser)) {
      errors.push({ line, field: "row", value: r.join(" | ").slice(0, 80) })
      return
    }
    clients.push(c)
  })
  return { clients, errors }
}

/** key=value pairs of a RouterOS line (quoted values with \" and spaces understood). */
function pairs(line: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([a-z][a-z0-9-]*)=("((?:\\.|[^"\\])*)"|\S*)/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out[m[1].toLowerCase()] = m[3] !== undefined ? m[3].replace(/\\(.)/g, "$1") : m[2]
  return out
}


/** The accounts of a `/ppp secret export` as clients with an internet service (user, plan = profile, name = comment, status). */
export function pppSecretsToClients(text: string): { clients: Client[]; skipped: number } {
  const joined = text.replace(/\r\n?/g, "\n").replace(/\\\n\s*/g, "")
  let inSecrets = false
  const clients: Client[] = []
  let skipped = 0
  for (const raw of joined.split("\n")) {
    const line = raw.trim()
    if (line.startsWith("/")) {
      inSecrets = /^\/ppp secret\b/.test(line)
      // export terse: "/ppp secret add name=… …" on one line
      if (!/^\/ppp secret add\b/.test(line)) continue
    } else if (!inSecrets || !line.startsWith("add ")) continue
    const p = pairs(line)
    if (!p.name) {
      skipped++
      continue
    }
    if (p.service && !["pppoe", "any"].includes(p.service)) {
      skipped++
      continue
    }
    const suspended = p.disabled === "yes" || /^DSX-suspendido/i.test(p.profile ?? "")
    clients.push(
      newClient({
        name: (p.comment ?? "").slice(0, 200),
        services: [newService("internet", { ontModel: "", pppoeUser: p.name.slice(0, 64), plan: (p.profile ?? "").slice(0, 120), status: suspended ? "suspendido" : "activo" })],
      })
    )
  }
  return { clients, skipped }
}

/** The list as CSV (UTF-8 with BOM so Excel shows accents), with Spanish headers: one row per client, its first internet and first IPTV service (the same columns the import reads). */
export function clientsCsv(list: Client[], headers: Record<ImportField, string>, labels: { kind: Record<ClientKind, string>; status: Record<string, string> }): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const row = (c: Client) => {
    const net = c.services.find((s) => s.type === "internet")
    const tv = c.services.find((s) => s.type === "iptv")
    const main = net ?? tv
    const val: Record<ImportField, unknown> = {
      kind: labels.kind[c.kind],
      name: c.name,
      phone: c.phone,
      whatsapp: c.whatsapp,
      email: c.email,
      building: c.building,
      tower: c.tower,
      apartment: c.apartment,
      plan: net?.plan ?? "",
      installDate: main?.start ?? "",
      monthly: net?.monthly ?? (tv && !net ? tv.monthly : null),
      status: labels.status[main?.status ?? clientStatus(c)],
      ontModel: net?.ontModel ?? "",
      ontSn: net?.ontSn ?? "",
      pppoeUser: net?.pppoeUser ?? "",
      deployment: net?.deployment ?? "",
      oltPort: net?.oltPort ?? "",
      ontId: net?.ontId ?? null,
      tv: !!tv,
      tvPackage: tv?.plan ?? "",
      tvMonthly: net ? (tv?.monthly ?? null) : null,
      payDay: c.payDay,
      payMethod: c.payMethod,
      notes: c.notes,
    }
    return IMPORT_FIELDS.map((f) => esc(val[f])).join(",")
  }
  const lines = [IMPORT_FIELDS.map((f) => esc(headers[f])).join(","), ...list.map(row)]
  return "﻿" + lines.join("\r\n") + "\r\n"
}
