/**
 * The client's service contract signed on their phone (WispDavor phase 15, owner 2026-11-22: "do all"). The text is the
 * owner's: an admin pastes the version their lawyer approved (WispDavor → Contrato); nothing here writes legal terms.
 * Until there is a text, the portal doesn't offer a contract at all. Each saved text is a new version; a client signs
 * the current one once (typed full name + drawn signature + "I read and accept"), and the signed copy goes to Legal →
 * Contratos as a PDF with the signature, the time and the text's fingerprint. Pure rules here; storage in
 * contrato-server.ts.
 */
import { clientLabel, type Client } from "../clients/model"
import type { PdfLine } from "../pdf/simple"
import { wrapText } from "../pdf/simple"

export type Template = { title: string; body: string; version: number; updatedAt: string; updatedBy: string }
export const EMPTY_TEMPLATE: Template = { title: "", body: "", version: 0, updatedAt: "", updatedBy: "" }
export const MAX_BODY = 60000

/** The fields a text may use; each is replaced with the client's data when they read and sign it. */
export const FIELDS = ["nombre", "direccion", "plan", "precio", "telefono", "fecha"] as const

export function decodeTemplate(v: unknown): Template {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  return {
    title: typeof o.title === "string" ? o.title.trim().slice(0, 160) : "",
    body: typeof o.body === "string" ? o.body.slice(0, MAX_BODY) : "",
    version: typeof o.version === "number" && Number.isInteger(o.version) && o.version >= 0 ? o.version : 0,
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
    updatedBy: typeof o.updatedBy === "string" ? o.updatedBy.slice(0, 80) : "",
  }
}

/** There's a text to sign. */
export const hasTemplate = (t: Template) => t.version > 0 && !!t.body.trim() && !!t.title

const money = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/** The text with the client's data in place of {{field}}; a field we don't know stays as written (visible). */
export function fillTemplate(body: string, c: Client, today: string): string {
  const net = c.services.filter((s) => s.status !== "cancelado")
  const internet = net.find((s) => s.type === "internet")
  const monthly = net.reduce((a, s) => a + (s.monthly ?? 0), 0)
  const values: Record<(typeof FIELDS)[number], string> = {
    nombre: c.name.trim() || clientLabel(c),
    direccion: [c.building, c.tower && `Torre ${c.tower}`, c.apartment && `Depto. ${c.apartment}`].filter(Boolean).join(", "),
    plan: [internet?.plan, ...net.filter((s) => s.type !== "internet").map((s) => s.plan)].filter(Boolean).join(" + "),
    precio: monthly ? money(monthly) : "",
    telefono: c.whatsapp || c.phone,
    fecha: day(today),
  }
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k: string) => ((FIELDS as readonly string[]).includes(k) ? values[k as (typeof FIELDS)[number]] || "—" : all))
}

export type Signature = { name: string; at: string; ipHash: string; hash: string; version: number }

/** The signed copy as PDF lines: the title, the filled text, then who signed, when, from where and the fingerprint. */
export function contractLines(title: string, text: string, s: Signature): PdfLine[] {
  const when = new Date(s.at).toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "long", timeStyle: "short" })
  return [
    { text: title, size: 14, bold: true, gap: 0 },
    { text: `Versión ${s.version} del texto`, size: 9, muted: true },
    ...wrapText(text, 10).map((l) => ({ text: l, size: 10, gap: 14 })),
    { text: "Firma electrónica", size: 11, bold: true, gap: 28 },
    { text: `Firmó: ${s.name}`, size: 10 },
    { text: `Cuándo: ${when} (hora de la Ciudad de México)`, size: 10 },
    { text: "Cómo: desde su portal de cliente de GigaFazt (enlace privado), con su nombre escrito, su firma dibujada y la casilla «Leí y acepto».", size: 9, muted: true },
    { text: `Origen (resumen de su IP): ${s.ipHash.slice(0, 16)}`, size: 9, muted: true },
    { text: `Huella SHA-256 del texto firmado: ${s.hash}`, size: 8, muted: true },
    { text: "La firma dibujada se guarda como imagen junto a este documento en el registro de contratos.", size: 9, muted: true },
  ]
}

/** A typed full name: at least two words of two letters. */
export const validSigner = (name: string) => name.trim().split(/\s+/).filter((w) => w.length >= 2).length >= 2 && name.trim().length <= 120
