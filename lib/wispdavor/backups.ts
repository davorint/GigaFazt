/**
 * Router configuration copies (WispDavor phase 7, owner 2026-11-22: "an option of storing the current configuration of
 * the mikrotiks"; recommended settings: daily + on demand, without secrets, last 30 per router, what changed + an alert).
 * The agent sends its /export in pieces (lib/wispdavor/routers.ts, action "backup"); Router en vivo can take one over
 * REST/API too. Pure rules here; storage in backups-server.ts.
 */

/** Copies kept per router. */
export const KEEP_BACKUPS = 30
/** Each piece the router reads (/file read takes at most 32 KB) and posts (fetch http-data at most 64 KB). */
export const BACKUP_CHUNK = 30000
/** At most this many pieces (about 6 MB): a bigger export isn't one of ours. */
export const MAX_PARTS = 200

/**
 * The configuration as compared: without the export's first-line date stamp ("# 2026-11-22 03:00:01 by RouterOS
 * 7.25.1") and trailing spaces, so a copy with nothing changed has the same fingerprint as the one before.
 */
export function normalizeConfig(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l, i) => !(i < 3 && /^#.*\bby RouterOS\b/i.test(l)))
    .map((l) => l.replace(/\s+$/, ""))
    .join("\n")
    .trim()
}

/** Lines added and removed between two copies (in each copy's order; a moved line counts in neither). */
export function diffConfigs(before: string, after: string): { added: string[]; removed: string[] } {
  const count = (t: string) => {
    const m = new Map<string, number>()
    for (const l of normalizeConfig(t).split("\n")) if (l.trim()) m.set(l, (m.get(l) ?? 0) + 1)
    return m
  }
  const a = count(before)
  const b = count(after)
  const take = (lines: string[], other: Map<string, number>) => {
    const left = new Map(other)
    return lines.filter((l) => {
      if (!l.trim()) return false
      const n = left.get(l) ?? 0
      if (n > 0) {
        left.set(l, n - 1)
        return false
      }
      return true
    })
  }
  return { added: take(normalizeConfig(after).split("\n"), a), removed: take(normalizeConfig(before).split("\n"), b) }
}

/**
 * Lines WispDavor itself changes every day (cut-offs and reconnections switch PPPoE profiles, new users, hotspot
 * vouchers): a change there isn't "someone edited the router by hand", so it doesn't alert (the copy is still kept).
 */
export const isManagedLine = (l: string) => /^\/(ppp secret|ppp active|ip hotspot user) /.test(l.trim())

/** The added and removed lines that matter for the alert (not WispDavor's own). */
export function handChanges(d: { added: string[]; removed: string[] }) {
  return { added: d.added.filter((l) => !isManagedLine(l)), removed: d.removed.filter((l) => !isManagedLine(l)) }
}

/** A piece's header from the router: "<action id>/<piece>/<pieces>"; null when malformed. */
export function parsePartHeader(h: string): { upload: string; idx: number; total: number } | null {
  const m = /^(\d{1,18})\/(\d{1,4})\/(\d{1,4})$/.exec(h.trim())
  if (!m) return null
  const idx = Number(m[2])
  const total = Number(m[3])
  return total >= 1 && total <= MAX_PARTS && idx < total ? { upload: m[1], idx, total } : null
}
