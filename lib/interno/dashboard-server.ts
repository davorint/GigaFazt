/**
 * The network figures for the Tablero (owner, 2026-11-22: "a stunning dashboard with Apache ECharts", all five
 * sections): traffic by weekday × hour (Mexico City) over the last 4 weeks, outages of the last 7 days, and each
 * deployment's busy-hour use (lib/wispdavor/capacity). The money, client and operations figures come from the records
 * the phone already syncs. Server code only.
 */
import "server-only"
import { getPool } from "../db/client"
import { capacityAll } from "../wispdavor/capacity-server"

export type NetworkFigures = {
  /** heat[weekday 0=lunes][hour 0–23] = average total Mbps (down + up) across the network; null = no data that hour. */
  heat: (number | null)[][]
  outages7: number
  openOutages: number
  sites: { name: string; use: number | null; busyDown: number | null; speedDown: number | null }[]
  hasTraffic: boolean
}

export async function networkFigures(): Promise<NetworkFigures> {
  const pool = getPool()
  // The last 7 days from the 5-minute table, older days (up to 28) from the hourly one; both summed per hour first.
  // The hour still running is left out (it would pull its cell's average down).
  const rows = (
    await pool.query(
      `with hours as (
         select date_trunc('hour', bucket) as h, sum(down + up)::float8 as bytes from traffic_5m where bucket > now() - interval '7 days' and bucket < date_trunc('hour', now()) group by 1
         union all
         select hour as h, sum(down + up)::float8 from traffic_hourly where hour > now() - interval '28 days' and hour <= now() - interval '7 days' group by 1
       )
       select extract(isodow from h at time zone 'America/Mexico_City')::int as dow, extract(hour from h at time zone 'America/Mexico_City')::int as hr,
              avg(bytes * 8 / 3600 / 1e6)::float8 as mbps
         from hours group by 1, 2`
    )
  ).rows as { dow: number; hr: number; mbps: number }[]
  const heat: (number | null)[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => null))
  for (const r of rows) heat[r.dow - 1][r.hr] = Math.round(r.mbps * 10) / 10
  const o = (await pool.query(`select count(*) filter (where started_at > now() - interval '7 days')::int as n, count(*) filter (where ended_at is null)::int as open from outages`)).rows[0] as { n: number; open: number }
  const cap = await capacityAll()
  return {
    heat,
    outages7: o.n,
    openOutages: o.open,
    sites: cap.map((s) => ({ name: s.name, use: s.use, busyDown: s.busy ? Math.round(s.busy.down * 10) / 10 : null, speedDown: s.speed.down })),
    hasTraffic: rows.length > 0,
  }
}
