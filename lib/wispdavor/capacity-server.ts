/**
 * Link capacity on the server (phase 13; rules in lib/wispdavor/capacity.ts): the last DAYS days of 5-minute traffic
 * summed per deployment (every router of that deployment), and the daily alert for deployments whose busy hour reaches
 * FULL_SHARE of their links (once a day each). Server code only.
 */
import "server-only"
import { decodeClient, type Client } from "../clients/model"
import { getPool } from "../db/client"
import { sendText } from "../reports/notify"
import { SITE_URL } from "../site"
import { decodeSite, siteLabel, type Site } from "../sites/model"
import { DAYS, FULL_SHARE, siteCapacity, type Bucket, type SiteCapacity } from "./capacity"

const KEY = "capacidad-avisos"

async function load(): Promise<{ sites: Site[]; clients: Client[]; buckets: Map<string, Bucket[]> }> {
  const pool = getPool()
  const sites = ((await pool.query(`select id, data from sites where deleted_at is null`)).rows as { id: string; data: unknown }[]).flatMap((r) => {
    const s = decodeSite(r.data)
    return s ? [{ ...s, id: r.id }] : []
  })
  const clients = ((await pool.query(`select id, data from clients where deleted_at is null`)).rows as { id: string; data: unknown }[]).flatMap((r) => {
    const c = decodeClient(r.data)
    return c ? [{ ...c, id: r.id }] : []
  })
  const rows = (
    await pool.query(
      `select r.site_id, t.bucket, sum(t.down)::float8 as down, sum(t.up)::float8 as up
         from traffic_5m t join routers r on r.id = t.router_id
        where t.bucket > now() - make_interval(days => $1) and r.site_id <> ''
        group by 1, 2 order by 2`,
      [DAYS]
    )
  ).rows as { site_id: string; bucket: Date; down: number; up: number }[]
  const buckets = new Map<string, Bucket[]>()
  for (const r of rows) buckets.set(r.site_id, [...(buckets.get(r.site_id) ?? []), { at: r.bucket.toISOString(), down: r.down, up: r.up }])
  return { sites, clients, buckets }
}

/** Every deployment with a router reporting traffic or links with a speed; fullest first. */
export async function capacityAll(): Promise<(SiteCapacity & { buckets: Bucket[] })[]> {
  const { sites, clients, buckets } = await load()
  return sites
    .map((s) => ({ ...siteCapacity(s, siteLabel(s), buckets.get(s.id) ?? [], clients), buckets: buckets.get(s.id) ?? [] }))
    .filter((x) => x.buckets.length || x.speed.links)
    .sort((a, b) => (b.use ?? -1) - (a.use ?? -1))
}

/** Days between two alerts for the same deployment while it stays full (sooner if it gets 5 points fuller). */
const REPEAT_DAYS = 7

/** The daily job: an alert for each full deployment, once a week while it stays full (or when it gets fuller). */
export async function capacityAlerts(today: string): Promise<{ full: number; sent: number }> {
  const all = await capacityAll()
  const full = all.filter((x) => x.full)
  if (!full.length) return { full: 0, sent: 0 }
  const pool = getPool()
  // Per deployment: the day of the last alert and the use it reported ("2026-11-22|85"; an older plain date still reads).
  const sent = (((await pool.query(`select value from wisp_settings where key = $1`, [KEY])).rows[0] as { value: Record<string, string> } | undefined)?.value ?? {}) as Record<string, string>
  let n = 0
  for (const x of full) {
    const pct = Math.round((x.use ?? 0) * 100)
    const [lastDay, lastPct] = (sent[x.siteId] ?? "").split("|")
    const days = lastDay ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${lastDay}T12:00:00Z`)) / 864e5) : Infinity
    if (days < REPEAT_DAYS && pct < Number(lastPct || 0) + 5) continue
    await sendText("capacidad", `📶 ${x.name}: sus enlaces llegan al ${pct} % en la hora pico (${Math.round(x.busy?.down ?? 0)} de ${x.speed.down ?? "?"} Mbps de bajada). Más de ${Math.round(FULL_SHARE * 100)} %: piensa en subir el enlace.\n${SITE_URL}/interno/software/wispdavor/capacidad`).catch(() => undefined)
    sent[x.siteId] = `${today}|${pct}`
    n++
  }
  await pool.query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, 'Capacidad') on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [KEY, sent]
  )
  return { full: full.length, sent: n }
}
