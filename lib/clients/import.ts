/**
 * Getting the current subscribers in (owner, 2026-11-17: "give me the option to do either"):
 * - a spreadsheet: CSV, or rows pasted straight from Excel / Google Sheets (tabs), with a header row or not; each
 *   column is matched to a field (guessed from the header, changeable), values converted (dates dd/mm/aaaa or
 *   aaaa-mm-dd, "$1,234.50", sí/no), and every line with a problem listed before anything is saved;
 * - the MikroTik: `/ppp secret export` (or `export terse`): each account becomes a client with its PPPoE user, its
 *   profile as the plan, the comment as the name, and suspended when the account is disabled or on DSX-suspendido.
 * Matching with the clients already there is done by mergeClients (model.ts): known clients only get empty fields
 * filled.
 */
import { CLIENT_STATUSES, PAY_METHODS, newClient, type Client, type ClientStatus, type PayMethod } from "./model"

/** Fields a spreadsheet column can fill. */
export const IMPORT_FIELDS = [
  "name",
  "phone",
  "whatsapp",
  "email",
  "building",
  "tower",
  "apartment",
  "plan",
  "tv",
  "installDate",
  "monthly",
  "status",
  "ontModel",
  "ontSn",
  "pppoeUser",
  "deployment",
  "oltPort",
  "ontId",
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
  name: ["nombre", "cliente", "name", "nombre completo", "titular"],
  phone: ["telefono", "tel", "celular", "phone", "movil"],
  whatsapp: ["whatsapp", "wa", "whats"],
  email: ["correo", "email", "e mail", "mail"],
  building: ["edificio", "condominio", "desarrollo", "building", "torre edificio", "conjunto"],
  tower: ["torre", "tower", "bloque"],
  apartment: ["departamento", "depto", "dpto", "apartment", "apt", "unidad", "numero interior", "interior"],
  plan: ["plan", "paquete", "perfil", "profile", "velocidad"],
  tv: ["tv", "television", "television add on"],
  installDate: ["instalacion", "fecha instalacion", "fecha de instalacion", "alta", "fecha alta", "install date"],
  monthly: ["mensualidad", "precio", "renta", "cuota", "monto", "monthly", "pago mensual"],
  status: ["estado", "estatus", "status"],
  ontModel: ["modelo ont", "modelo", "ont model", "equipo"],
  ontSn: ["serie", "sn", "numero de serie", "serial", "ont sn", "sn ont"],
  pppoeUser: ["usuario", "pppoe", "usuario pppoe", "user", "login", "cuenta"],
  deployment: ["despliegue", "red", "nodo", "deployment"],
  oltPort: ["puerto", "puerto olt", "pon", "olt port"],
  ontId: ["ont id", "id ont", "onu id"],
  payDay: ["dia de pago", "dia pago", "corte", "pay day"],
  payMethod: ["forma de pago", "metodo de pago", "pago", "pay method"],
  notes: ["notas", "observaciones", "comentarios", "notes", "comentario"],
}

export function guessField(header: string): ImportField | "" {
  const h = fold(header)
  if (!h) return ""
  for (const f of IMPORT_FIELDS) if (ALIASES[f].includes(h)) return f
  for (const f of IMPORT_FIELDS) if (ALIASES[f].some((a) => a.length > 3 && h.includes(a))) return f
  return ""
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
function toStatus(v: string): ClientStatus | null {
  const f = fold(v)
  if (!f) return null
  if (/^(activo|active|alta|ok|si)/.test(f)) return "activo"
  if (/^(suspend|corte|cortado|moroso|bloque)/.test(f)) return "suspendido"
  if (/^(cancel|baja|inactivo|retir)/.test(f)) return "cancelado"
  return (CLIENT_STATUSES as readonly string[]).includes(f) ? (f as ClientStatus) : null
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

/** The clients of a table with its column → field mapping; lines with problems listed (and still imported without the bad value). */
export function rowsToClients(rows: string[][], mapping: (ImportField | "")[], skipHeader: boolean): { clients: Client[]; errors: RowError[] } {
  const clients: Client[] = []
  const errors: RowError[] = []
  rows.forEach((r, k) => {
    if (skipHeader && k === 0) return
    const line = k + 1
    const c = newClient({ ontModel: "" })
    mapping.forEach((f, i) => {
      const v = (r[i] ?? "").trim()
      if (!f || !v) return
      switch (f) {
        case "tv":
          c.tv = yes(v)
          break
        case "installDate": {
          const d = toDate(v)
          if (d) c.installDate = d
          else errors.push({ line, field: f, value: v })
          break
        }
        case "monthly": {
          const n = toMoney(v)
          if (n !== null) c.monthly = n
          else errors.push({ line, field: f, value: v })
          break
        }
        case "status": {
          const s = toStatus(v)
          if (s) c.status = s
          else errors.push({ line, field: f, value: v })
          break
        }
        case "payMethod": {
          const m = toMethod(v)
          if (m !== null) c.payMethod = m
          break
        }
        case "payDay":
        case "ontId": {
          const n = Number(v)
          const ok = Number.isInteger(n) && n >= (f === "payDay" ? 1 : 0) && n <= (f === "payDay" ? 31 : 255)
          if (ok) c[f] = n
          else errors.push({ line, field: f, value: v })
          break
        }
        case "ontSn":
          c.ontSn = v.toUpperCase().slice(0, 40)
          break
        default:
          ;(c as Record<string, unknown>)[f] = v.slice(0, f === "notes" ? 4000 : 200)
      }
    })
    if (!c.name && !c.pppoeUser) {
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

/** The accounts of a `/ppp secret export` as clients (user, plan = profile, name = comment, status). */
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
        ontModel: "",
        pppoeUser: p.name.slice(0, 64),
        plan: (p.profile ?? "").slice(0, 80),
        name: (p.comment ?? "").slice(0, 200),
        status: suspended ? "suspendido" : "activo",
      })
    )
  }
  return { clients, skipped }
}

/** The list as CSV (UTF-8 with BOM so Excel shows accents), with Spanish headers. */
export function clientsCsv(list: Client[], headers: Record<ImportField, string>): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [IMPORT_FIELDS.map((f) => esc(headers[f])).join(","), ...list.map((c) => IMPORT_FIELDS.map((f) => esc(c[f])).join(","))]
  return "\uFEFF" + lines.join("\r\n") + "\r\n"
}
