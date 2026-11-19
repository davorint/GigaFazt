/**
 * The weekly automatic backup (owner, 2026-11-19: "both"):
 * - a Neon snapshot: a branch of the production database named `respaldo-YYYY-MM-DD` (no compute, so it costs only
 *   storage), keeping the last KEEP; the free plan only restores the last day, these go back a month. Needs
 *   NEON_API_KEY (project-scoped) and NEON_PROJECT_ID on the host.
 * - the same JSON as "Descargar respaldo" (/interno), sent as a file to the team's Telegram chat when the bot is set
 *   (REPORT_TELEGRAM_BOT_TOKEN, REPORT_TELEGRAM_CHAT_ID): a copy outside Neon. It holds personal data, so only that chat
 *   gets it.
 * Each part runs on its own; what didn't run says why.
 */
import "server-only"
import { fullBackup } from "../sync/history"

export const KEEP = 4
export const PREFIX = "respaldo-"
const API = "https://console.neon.tech/api/v2"

type Branch = { id: string; name: string; default?: boolean; primary?: boolean; created_at: string }

/** The snapshot branches to delete: the oldest ones beyond `keep` (newest kept). */
export function toPrune(branches: Pick<Branch, "id" | "name" | "created_at">[], keep = KEEP): string[] {
  return branches
    .filter((b) => b.name.startsWith(PREFIX))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(keep)
    .map((b) => b.id)
}

async function neon(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${process.env.NEON_API_KEY}`, accept: "application/json", "content-type": "application/json", ...init.headers }, signal: AbortSignal.timeout(20000) })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(`Neon ${res.status}: ${String(body.message ?? "").slice(0, 120)}`)
  return body
}

export async function neonSnapshot(day: string): Promise<{ ok: boolean; detail: string }> {
  const project = process.env.NEON_PROJECT_ID
  if (!process.env.NEON_API_KEY || !project) return { ok: false, detail: "sin NEON_API_KEY / NEON_PROJECT_ID" }
  const list = ((await neon(`/projects/${project}/branches`)).branches ?? []) as Branch[]
  const main = list.find((b) => b.default || b.primary)
  if (!main) return { ok: false, detail: "no se encontró la rama principal" }
  const name = `${PREFIX}${day}`
  if (!list.some((b) => b.name === name)) await neon(`/projects/${project}/branches`, { method: "POST", body: JSON.stringify({ branch: { name, parent_id: main.id } }) })
  const after = ((await neon(`/projects/${project}/branches`)).branches ?? []) as Branch[]
  const old = toPrune(after)
  for (const id of old) await neon(`/projects/${project}/branches/${id}`, { method: "DELETE" })
  return { ok: true, detail: `${name} creado; ${old.length} viejo(s) borrado(s)` }
}

export async function telegramFile(day: string): Promise<{ ok: boolean; detail: string }> {
  const token = process.env.REPORT_TELEGRAM_BOT_TOKEN
  const chat = process.env.REPORT_TELEGRAM_CHAT_ID
  if (!token || !chat) return { ok: false, detail: "sin bot de Telegram" }
  const json = JSON.stringify(await fullBackup())
  const form = new FormData()
  form.set("chat_id", chat)
  form.set("caption", `Respaldo semanal de GigaFazt (${day}). Contiene datos personales: no lo reenvíes.`)
  form.set("document", new Blob([json], { type: "application/json" }), `gigafazt-respaldo-${day}.json`)
  const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form, signal: AbortSignal.timeout(30000) })
  return res.ok ? { ok: true, detail: `${Math.round(json.length / 1024)} KB enviados` } : { ok: false, detail: `Telegram ${res.status}` }
}
