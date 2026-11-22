/** The WireGuard tunnel on the server (phase 11; rules and scripts in lib/wispdavor/tunnel.ts). Server code only. */
import "server-only"
import { getPool } from "../db/client"
import { EMPTY_SETTINGS, decodeSettings, forwardPorts, nextNumber, peerIp, routerScript, validKey, vpsScript, type Peer, type TunnelSettings } from "./tunnel"

const KEY = "tunel"

export async function getTunnel(): Promise<TunnelSettings> {
  const r = (await getPool().query(`select value from wisp_settings where key = $1`, [KEY])).rows[0] as { value: unknown } | undefined
  return r ? decodeSettings(r.value) : EMPTY_SETTINGS
}

export async function saveTunnel(v: unknown, by: string): Promise<TunnelSettings> {
  const s = decodeSettings(v)
  await getPool().query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY, s, by]
  )
  return s
}

/** Every router with its tunnel entry (if it has one) and its REST / API ports (from Router en vivo, else the defaults). */
export async function peers(): Promise<(Peer & { inTunnel: boolean; usingTunnel: boolean })[]> {
  const s = await getTunnel()
  const rows = (
    await getPool().query(
      `select r.id, r.name, t.n, t.public_key, t.rest_port, t.api_port as t_api, coalesce(x.port, 443) as port, coalesce(x.api_port, 8729) as api_port, coalesce(x.host, '') as host
         from routers r left join router_tunnels t on t.router_id = r.id left join router_rest x on x.router_id = r.id order by r.name`
    )
  ).rows as { id: string; name: string; n: number | null; public_key: string | null; rest_port: number | null; t_api: number | null; port: number; api_port: number; host: string }[]
  return rows.map((r) => {
    const inTunnel = r.n !== null
    const usingTunnel = inTunnel && !!s.host && r.host === s.host && r.port === forwardPorts(r.n!).rest
    return {
      routerId: r.id,
      name: r.name,
      n: r.n ?? 0,
      publicKey: r.public_key ?? "",
      // In the tunnel: the router's own ports as kept when it joined; otherwise its Router en vivo ports.
      restPort: r.rest_port ?? r.port,
      apiPort: r.t_api ?? r.api_port,
      inTunnel,
      usingTunnel,
    }
  })
}

/** Puts a router in the tunnel (its number); answers its script. */
export async function addPeer(routerId: string, by: string): Promise<{ n: number; script: string } | "full" | "not-found"> {
  const pool = getPool()
  const r = (await pool.query(`select name from routers where id = $1`, [routerId])).rows[0] as { name: string } | undefined
  if (!r) return "not-found"
  const all = await peers()
  const mine = all.find((p) => p.routerId === routerId)!
  let n = mine.inTunnel ? mine.n : nextNumber(all.filter((p) => p.inTunnel).map((p) => p.n))
  if (n === null) return "full"
  if (!mine.inTunnel) {
    await pool.query(`insert into router_tunnels (router_id, n, rest_port, api_port, updated_by) values ($1, $2, $3, $4, $5) on conflict (router_id) do nothing`, [routerId, n, mine.restPort, mine.apiPort, by])
    n = ((await pool.query(`select n from router_tunnels where router_id = $1`, [routerId])).rows[0] as { n: number }).n
  }
  return { n, script: routerScript(await getTunnel(), { n, name: r.name }, { rest: mine.restPort, api: mine.apiPort }) }
}

export async function setPeerKey(routerId: string, key: string, by: string): Promise<boolean> {
  if (!validKey(key)) return false
  const r = await getPool().query(`update router_tunnels set public_key = $2, updated_at = now(), updated_by = $3 where router_id = $1`, [routerId, key.trim(), by])
  return (r.rowCount ?? 0) > 0
}

export async function removePeer(routerId: string) {
  await getPool().query(`delete from router_tunnels where router_id = $1`, [routerId])
}

/**
 * Router en vivo through the tunnel: its host becomes the VPS and its ports the forwarded ones (the certificate
 * fingerprint and users stay). `off` puts back the router's own ports with an empty host (to type its address again).
 */
export async function routeThroughTunnel(routerId: string, on: boolean, by: string): Promise<"ok" | "no-host" | "not-in-tunnel"> {
  const s = await getTunnel()
  const p = (await peers()).find((x) => x.routerId === routerId)
  if (!p?.inTunnel) return "not-in-tunnel"
  if (on && !s.host) return "no-host"
  const f = forwardPorts(p.n)
  const host = on ? s.host : ""
  const port = on ? f.rest : p.restPort
  const api = on ? f.api : p.apiPort
  await getPool().query(
    `insert into router_rest (router_id, host, port, api_port, updated_by) values ($1, $2, $3, $4, $5)
     on conflict (router_id) do update set host = $2, port = $3, api_port = $4, updated_at = now(), updated_by = $5`,
    [routerId, host, port, api, by]
  )
  return "ok"
}

export async function vpsSetup(): Promise<string> {
  return vpsScript(await getTunnel(), (await peers()).filter((p) => p.inTunnel))
}

export { peerIp }
