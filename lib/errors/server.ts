/**
 * Error reporting (owner, 2026-11-19: "production error monitoring"). Errors on the server (instrumentation.ts) and
 * pages that crash in a browser (POST /api/errores from the error screens) are logged and, when an alert channel is
 * set (REPORT_TELEGRAM_* or REPORT_WEBHOOK_URL, lib/reports/notify.ts), sent to it so the team hears of them.
 *
 * Not to flood the chat: each distinct error (same source, message and path) goes out at most once an hour, and at most
 * MAX_PER_HOUR alerts in total (counted in report_hits with an "er:" prefix; without the database, once per error per
 * server instance). Only the path is sent, never the query string or anything a visitor typed.
 */
import "server-only"
import { createHash } from "node:crypto"
import { getPool, hasDatabase } from "../db/client"
import { hit, underLimit } from "../reports/limits"
import { alertChannels, sendText } from "../reports/notify"

export const MAX_PER_HOUR = 30

export type ErrorReport = { source: "server" | "client"; message: string; path: string; digest?: string; detail?: string }

const seen = new Map<string, number>()

/** The path without its query string or fragment, at most 200 characters. */
export const cleanPath = (p: string) => p.split(/[?#]/)[0].slice(0, 200)

export function errorText(e: ErrorReport): string {
  return [`⚠️ Error en ${e.source === "server" ? "el servidor" : "el navegador"}`, `Página: ${e.path || "—"}`, `Error: ${e.message.slice(0, 500) || "—"}`, e.digest && `Ref: ${e.digest}`, e.detail && e.detail.slice(0, 300)].filter(Boolean).join("\n")
}

export async function reportError(e: ErrorReport): Promise<"sent" | "logged"> {
  const r = { ...e, path: cleanPath(e.path), message: e.message.slice(0, 500) }
  console.error(`[error:${r.source}] ${r.path} ${r.message}${r.digest ? ` (${r.digest})` : ""}`)
  const ch = alertChannels()
  if (!ch.telegram && !ch.webhook) return "logged"
  const key = createHash("sha256").update(`${r.source}|${r.message}|${r.path}`).digest("hex").slice(0, 24)
  const now = Date.now()
  if ((seen.get(key) ?? 0) > now - 3600e3) return "logged"
  seen.set(key, now)
  if (hasDatabase()) {
    try {
      const pool = getPool()
      if (!(await underLimit(pool, `er:${key}`, 1)) || !(await underLimit(pool, "er:all", MAX_PER_HOUR))) return "logged"
      await Promise.all([hit(pool, `er:${key}`), hit(pool, "er:all")])
    } catch {
      // The database being down is often the error itself: send it anyway.
    }
  }
  await sendText("error", errorText(r), r).catch(() => undefined)
  return "sent"
}
