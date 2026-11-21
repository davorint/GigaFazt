import type { NextRequest } from "next/server"
import { getPool, hasDatabase } from "@/lib/db/client"
import { json, requireInterno } from "@/lib/internal-api"
import { safe } from "@/lib/wispdavor/routers"

/**
 * Traffic per PPPoE user (WispDavor → Tráfico). GET ?user=<pppoe>&days=1..90: points (5-minute buckets for up to 7
 * days, hourly beyond). GET ?top=1&days=1..7: the users that downloaded most. Bytes. Signed in only.
 */
export async function GET(request: NextRequest) {
  const denied = await requireInterno(request)
  if (denied) return denied
  if (!hasDatabase()) return json({ error: "no-database" }, 503)
  const p = request.nextUrl.searchParams
  const days = Math.max(1, Math.min(90, Number(p.get("days")) || 7))
  const pool = getPool()
  try {
    if (p.get("top")) {
      const d = Math.min(days, 7)
      const rows = (await pool.query(`select "user", sum(down)::bigint as down, sum(up)::bigint as up from traffic_5m where bucket > now() - ($1 || ' days')::interval group by 1 order by 2 desc limit 30`, [String(d)])).rows
      return json({ ok: true, days: d, top: rows })
    }
    const user = p.get("user") ?? ""
    if (!safe(user)) return json({ error: "bad-user" }, 400)
    // Up to 7 days: 5-minute detail; beyond: hourly (5-minute data still in range summed per hour, plus the hourly table).
    const rows =
      days <= 7
        ? (await pool.query(`select bucket as t, sum(down)::bigint as down, sum(up)::bigint as up from traffic_5m where "user" = $1 and bucket > now() - ($2 || ' days')::interval group by 1 order by 1`, [user, String(days)])).rows
        : (
            await pool.query(
              `select t, sum(down)::bigint as down, sum(up)::bigint as up from (
                 select hour as t, down, up from traffic_hourly where "user" = $1 and hour > now() - ($2 || ' days')::interval
                 union all
                 select date_trunc('hour', bucket), down, up from traffic_5m where "user" = $1 and bucket > now() - ($2 || ' days')::interval
               ) x group by 1 order by 1`,
              [user, String(days)]
            )
          ).rows
    return json({ ok: true, days, points: rows })
  } catch (e) {
    return json({ error: "server", detail: e instanceof Error ? e.message.slice(0, 160) : "error" }, 500)
  }
}
