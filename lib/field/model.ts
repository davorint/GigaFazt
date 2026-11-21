/**
 * Field work (WispDavor phase 5, owner 2026-11-21: a Técnico view in /interno, same team accounts): what the technician
 * records on a job, kept inside the appointment (Agenda) or the report (Reportes) it's about, so it syncs and works
 * offline like the rest. Photos and the client's signature are files (table `field_files`, Blob store like the
 * contracts); only their ids and names live here. Materials used are stock movements (kind "instalacion"/"reemplazo",
 * one batch), linked by `batch`.
 */
export const FIELD_FILE_KINDS = ["foto", "firma"] as const
export type FieldFileKind = (typeof FIELD_FILE_KINDS)[number]
export type FieldFile = { id: string; kind: FieldFileKind; name: string }

export type FieldWork = {
  /** When the technician got there ("" = not yet) and where the phone said (null = not shared). */
  arrivedAt: string
  lat: number | null
  lng: number | null
  /** When they finished ("" = not yet). */
  doneAt: string
  /** Who signed on the client's side (their name as written). */
  signedBy: string
  files: FieldFile[]
  /** The stock movements recorded for this job ("" = none). */
  batch: string
  /** What the technician says was done. */
  notes: string
}

export const emptyField = (): FieldWork => ({ arrivedAt: "", lat: null, lng: null, doneAt: "", signedBy: "", files: [], batch: "", notes: "" })

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v)
const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) ? v.slice(0, 40) : "")
const coord = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max ? v : null)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

/** Never throws; anything malformed becomes empty. Records from before phase 5 get an empty one. */
export function decodeField(v: unknown): FieldWork {
  if (!isObj(v)) return emptyField()
  return {
    arrivedAt: iso(v.arrivedAt),
    lat: coord(v.lat, 90),
    lng: coord(v.lng, 180),
    doneAt: iso(v.doneAt),
    signedBy: str(v.signedBy, 120),
    files: Array.isArray(v.files)
      ? v.files
          .filter(isObj)
          .map((f) => ({ id: typeof f.id === "string" && /^[\w-]{6,64}$/.test(f.id) ? f.id : "", kind: (FIELD_FILE_KINDS as readonly string[]).includes(String(f.kind)) ? (f.kind as FieldFileKind) : "foto", name: str(f.name, 120) }))
          .filter((f) => f.id)
          .slice(0, 30)
      : [],
    batch: typeof v.batch === "string" && /^[\w-]{0,64}$/.test(v.batch) ? v.batch : "",
    notes: str(v.notes, 2000),
  }
}

/** Photos per job and the largest file (the host takes 4.5 MB per request; photos are shrunk on the phone). */
export const MAX_FIELD_FILES = 30
export const MAX_FIELD_BYTES = 4 * 1024 * 1024

/** A job of the day, from an appointment or a report visit. */
export type JobRef = { kind: "agenda" | "reporte"; id: string }
