/**
 * Notes (/interno/admin/notas, owner 2026-11-18: "an internal post-it type of section"; answers: under admin, shared
 * through the database, colors, pin to top, done/archive, author and date; free-form, not linked to a client).
 *
 * A note is a title and a text on a colored post-it. Pinned notes come first, then the newest. Marking one done moves
 * it to "Hechas", where it can be restored or deleted. The author is the phone's name ("¿Quién eres?").
 *
 * Synced like the other sections (kind "notes", table `notes`). `decodeNote` reads stored or synced values field by
 * field and never throws.
 */
import { newId } from "../survey/id"

export const NOTE_COLORS = ["amarillo", "rosa", "azul", "verde", "naranja", "morado"] as const
export type NoteColor = (typeof NOTE_COLORS)[number]

/** What a note can be about (optional; owner, 2026-11-18). */
export const LINK_KINDS = ["client", "site", "report"] as const
export type LinkKind = (typeof LINK_KINDS)[number]

export type Note = {
  id: string
  title: string
  body: string
  color: NoteColor
  pinned: boolean
  /** When it was marked done (ISO); "" = open. */
  doneAt: string
  /** The client, deployment or report it is about ("" = none). */
  linkKind: LinkKind | ""
  linkId: string
  /** Who wrote it (the phone's name). */
  by: string
  createdAt: string
  updatedAt: string
}

export const TITLE_MAX = 120
export const BODY_MAX = 4000

export function newNote(p: Partial<Note> = {}): Note {
  return { id: newId(), title: "", body: "", color: "amarillo", pinned: false, doneAt: "", linkKind: "", linkId: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

export const isEmptyNote = (n: Pick<Note, "title" | "body">) => !n.title.trim() && !n.body.trim()

/** Open notes: pinned first, then newest. */
export function openNotes(list: Note[]) {
  return list.filter((n) => !n.doneAt).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt))
}
/** Done notes: the most recently finished first. */
export function doneNotes(list: Note[]) {
  return list.filter((n) => n.doneAt).sort((a, b) => b.doneAt.localeCompare(a.doneAt))
}

/** Case- and accent-insensitive search in the title, text and author. */
export function matchNote(n: Note, q: string) {
  const fold = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
  const words = fold(q).split(/\s+/).filter(Boolean)
  const hay = fold(`${n.title} ${n.body} ${n.by}`)
  return words.every((w) => hay.includes(w))
}

// ── Reading stored or synced values ─────────────────────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
const iso = (v: unknown) => (typeof v === "string" && Number.isFinite(Date.parse(v)) ? v.slice(0, 40) : "")
const ID = /^[\w-]{6,64}$/

const link = (k: unknown, id: unknown): { linkKind: LinkKind | ""; linkId: string } =>
  (LINK_KINDS as readonly unknown[]).includes(k) && typeof id === "string" && ID.test(id) ? { linkKind: k as LinkKind, linkId: id } : { linkKind: "", linkId: "" }

/** Where a linked record opens. */
export const linkHref = (k: LinkKind, id: string) =>
  k === "client" ? `/interno/admin/clientes?c=${id}` : k === "site" ? `/interno/admin/despliegues?d=${id}` : `/interno/admin/reportes_clientes?r=${id}`

export function decodeNote(v: unknown): Note | null {
  if (!isObj(v)) return null
  return {
    id: typeof v.id === "string" && ID.test(v.id) ? v.id : newId(),
    title: str(v.title, TITLE_MAX),
    body: str(v.body, BODY_MAX),
    color: (NOTE_COLORS as readonly unknown[]).includes(v.color) ? (v.color as NoteColor) : "amarillo",
    pinned: v.pinned === true,
    doneAt: iso(v.doneAt),
    ...link(v.linkKind, v.linkId),
    by: str(v.by, 40),
    createdAt: iso(v.createdAt) || new Date().toISOString(),
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
