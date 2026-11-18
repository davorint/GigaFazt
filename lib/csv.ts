/**
 * CSV for the internal exports: a byte-order mark so Excel opens the accents right, CRLF line ends, and only the
 * cells that need it quoted. Booleans as "sí"/"no", null and undefined as empty.
 */
export type Cell = string | number | boolean | null | undefined

const esc = (v: Cell) => {
  const s = v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "sí" : "no") : String(v)
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n"
}
