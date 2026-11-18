/**
 * What a phone and the server exchange to sync (POST /api/interno/sync), one kind of record per request.
 *
 * The phone sends the records it changed since its last sync (each with the version it started from and when it was
 * edited) and the last `rev` it has; the server applies them and answers with every record changed since that rev,
 * including the ones it just saved. Two phones changing the same record: the most recent edit wins and the other copy
 * goes to the history marked as a conflict (owner's choice, 2026-11-17).
 */
export const SYNC_KINDS = ["surveys", "materials", "providers", "clients", "sites"] as const
export type SyncKind = (typeof SYNC_KINDS)[number]

export type Change = {
  id: string
  /** The server version this edit started from; null when the record was never synced. */
  baseVersion: number | null
  /** The record (decoded again on the server); null for a deletion. */
  data: unknown
  deleted: boolean
  /** When it was edited on the phone (ISO); the newest edit wins a conflict. */
  editedAt: string
}

export type Remote = {
  id: string
  version: number
  data: unknown
  deleted: boolean
  editedAt: string
  editedBy: string
  rev: number
}

export type Outcome =
  /** Saved as sent. */
  | { id: string; outcome: "saved"; version: number }
  /** Another phone's newer edit won; this one is in the history as a conflict and the server's copy comes back. */
  | { id: string; outcome: "kept-server"; version: number }
  /** An untouched starter material that the database already has: the phone replaces its id by this one. */
  | { id: string; outcome: "merged"; into: string }
  /** Not saved (bad data); the phone keeps it and shows the error. */
  | { id: string; outcome: "rejected"; reason: string }

export type SyncRequest = { kind: SyncKind; since: number; changes: Change[] }
export type SyncResponse = { kind: SyncKind; rev: number; more: boolean; results: Outcome[]; records: Remote[] }

/** At most this many changes per request; the phone sends the rest in the next one. */
export const MAX_CHANGES = 100
/** Records returned per pull; `more` says to ask again. */
export const MAX_RECORDS = 500
export const MAX_BODY_BYTES = 2_000_000
/** Pull again from a little before the last rev, in case a slower save took a lower number after we read. */
export const REV_OVERLAP = 20
