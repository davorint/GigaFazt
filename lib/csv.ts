/**
 * CSV for the internal exports: a byte-order mark so Excel opens the accents right, CRLF line ends, and only the
 * cells that need it quoted. Booleans as "sí"/"no", null and undefined as empty.
 *
 * Text that starts like a formula (=, +, -, @, tab, carriage return) gets a leading apostrophe, so a name or note typed
 * on the public forms ("=HYPERLINK(…)") opens in Excel as text, never as a formula (CSV injection). Numbers are kept as
 * they are. The client import drops that apostrophe again.
 */
export type Cell = string | number | boolean | null | undefined

/** One cell, escaped. */
export function csvCell(v: Cell): string {
  let s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v)
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** The apostrophe csvCell puts before formula-like text, taken off (for reading our own files back). */
export const unguard = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s)

export function toCsv(headers: string[], rows: Cell[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n"
}
