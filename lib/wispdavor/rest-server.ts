/**
 * The REST connection on the server (lib/wispdavor/rest.ts has the rules): each router's settings with its passwords
 * encrypted (AES-256-GCM, key ROUTER_CRED_KEY on the host; never sent back to a browser), one HTTPS request at a time
 * with the read-only check in front, and what staff use: live view, client lookup, actions (logged like the agent's) and
 * config backups.
 *
 * Certificates: a publicly trusted one is checked as usual; a router's own is accepted only when its SHA-256
 * fingerprint matches the one saved, checked on the TLS connection before anything (the password) is sent.
 */
import "server-only"
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"
import { request } from "node:https"
import { connect, type TLSSocket } from "node:tls"
import { decodeClient } from "../clients/model"
import { getPool } from "../db/client"
import { SUSPENDED_PROFILE, safe } from "./routers"
import { setServiceStatus } from "./routers-server"
import { EXPORT_SCRIPT, bool, isReadRequest, normalizeFingerprint, num, safePath, validHost, type RestMethod } from "./rest"

const TIMEOUT_MS = 8000

// ── Credentials ─────────────────────────────────────────────────────────────

const key = () => {
  const k = (process.env.ROUTER_CRED_KEY ?? "").trim()
  return k ? createHash("sha256").update(k).digest() : null
}
export const credKeySet = () => key() !== null

function seal(plain: string): string {
  const k = key()
  if (!k) throw new Error("no-key")
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", k, iv)
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`
}

function open(sealed: string): string {
  const k = key()
  const [v, iv, tag, ct] = sealed.split(":")
  if (!k || v !== "v1" || !iv || !tag || !ct) return ""
  try {
    const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"))
    d.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8")
  } catch {
    return ""
  }
}

// ── Settings ────────────────────────────────────────────────────────────────

type Row = { router_id: string; host: string; port: number; read_user: string; read_pass: string; write_user: string; write_pass: string; fingerprint: string; read_only: boolean; updated_at: Date; updated_by: string }
/** What a browser may see: no passwords, only whether they're set. */
export type RestView = { host: string; port: number; readUser: string; writeUser: string; hasReadPass: boolean; hasWritePass: boolean; fingerprint: string; readOnly: boolean; updatedAt: string; updatedBy: string }

const row = async (routerId: string) => (await getPool().query(`select * from router_rest where router_id = $1`, [routerId])).rows[0] as Row | undefined

export async function restViews(): Promise<Record<string, RestView>> {
  const rows = (await getPool().query(`select * from router_rest`)).rows as Row[]
  return Object.fromEntries(
    rows.map((r) => [r.router_id, { host: r.host, port: r.port, readUser: r.read_user, writeUser: r.write_user, hasReadPass: !!r.read_pass, hasWritePass: !!r.write_pass, fingerprint: r.fingerprint, readOnly: r.read_only, updatedAt: r.updated_at.toISOString(), updatedBy: r.updated_by }])
  )
}

export type RestInput = { host?: string; port?: number; readUser?: string; readPass?: string; writeUser?: string; writePass?: string; clearWrite?: boolean; fingerprint?: string; readOnly?: boolean }

/** Saves a router's REST settings; a blank password keeps the saved one. Answers an error code or null. */
export async function saveRest(routerId: string, i: RestInput, by: string): Promise<string | null> {
  const cur = await row(routerId)
  const host = (i.host ?? cur?.host ?? "").trim().toLowerCase()
  const port = Math.round(i.port ?? cur?.port ?? 443)
  if (host && !validHost(host)) return "host"
  if (!(port >= 1 && port <= 65535)) return "port"
  const fp = i.fingerprint === undefined ? (cur?.fingerprint ?? "") : i.fingerprint.trim() ? normalizeFingerprint(i.fingerprint) : ""
  if (i.fingerprint?.trim() && !fp) return "fingerprint"
  const user = (u: string | undefined, c: string) => (u === undefined ? c : u.trim().slice(0, 64))
  const readUser = user(i.readUser, cur?.read_user ?? "")
  const writeUser = i.clearWrite ? "" : user(i.writeUser, cur?.write_user ?? "")
  if ((readUser && !/^[\w.@-]{1,64}$/.test(readUser)) || (writeUser && !/^[\w.@-]{1,64}$/.test(writeUser))) return "user"
  if (writeUser && writeUser === readUser) return "same-user"
  if ((i.readPass || i.writePass) && !credKeySet()) return "no-key"
  const readPass = i.readPass ? seal(i.readPass.slice(0, 128)) : (cur?.read_pass ?? "")
  const writePass = i.clearWrite ? "" : i.writePass ? seal(i.writePass.slice(0, 128)) : (cur?.write_pass ?? "")
  const readOnly = i.readOnly ?? cur?.read_only ?? true
  await getPool().query(
    `insert into router_rest (router_id, host, port, read_user, read_pass, write_user, write_pass, fingerprint, read_only, updated_at, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10)
     on conflict (router_id) do update set host = $2, port = $3, read_user = $4, read_pass = $5, write_user = $6, write_pass = $7, fingerprint = $8, read_only = $9, updated_at = now(), updated_by = $10`,
    [routerId, host, port, readUser, readPass, writeUser, writePass, fp, readOnly, by]
  )
  return null
}

// ── Requests ────────────────────────────────────────────────────────────────

export class RestError extends Error {
  constructor(public code: string, detail = "") {
    super(detail || code)
  }
}

/** The TLS connection, checked: a public CA, or exactly the saved fingerprint. Nothing is sent before this passes. */
function tlsConnect(host: string, port: number, fingerprint: string): Promise<TLSSocket> {
  return new Promise((resolve, reject) => {
    const sock = connect({ host, port, servername: /^[\d.]+$/.test(host) ? undefined : host, rejectUnauthorized: !fingerprint, timeout: TIMEOUT_MS })
    const fail = (code: string, e?: unknown) => {
      sock.destroy()
      reject(new RestError(code, e instanceof Error ? e.message.slice(0, 160) : ""))
    }
    sock.once("secureConnect", () => {
      if (fingerprint) {
        const got = normalizeFingerprint(sock.getPeerCertificate().fingerprint256 ?? "")
        if (got !== fingerprint) return fail("cert-mismatch", `huella recibida ${got.slice(0, 16)}…`)
      }
      resolve(sock)
    })
    sock.once("timeout", () => fail("timeout"))
    sock.once("error", (e: NodeJS.ErrnoException) => fail(/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/.test(e.code ?? e.message) ? "cert" : e.code === "ENOTFOUND" ? "dns" : "unreachable", e))
  })
}

/**
 * One REST request to a router. Reading goes with the read user; anything else only when the router isn't in read-only
 * mode and a write user is set. Answers the parsed JSON.
 */
export async function restCall(routerId: string, method: RestMethod, path: string, body?: unknown): Promise<unknown> {
  const r = await row(routerId)
  if (!r?.host) throw new RestError("not-configured")
  if (!safePath(path.split("?")[0])) throw new RestError("bad-path")
  const reading = isReadRequest(method, path.split("?")[0], body)
  if (!reading && r.read_only) throw new RestError("read-only")
  const user = reading ? r.read_user : r.write_user
  const pass = open(reading ? r.read_pass : r.write_pass)
  if (!user || !pass) throw new RestError(reading ? "no-read-user" : "no-write-user")
  const sock = await tlsConnect(r.host, r.port, r.fingerprint)
  const data = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: r.host,
        port: r.port,
        method,
        path: `/rest${path}`,
        createConnection: () => sock,
        headers: { authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`, accept: "application/json", ...(data ? { "content-type": "application/json", "content-length": Buffer.byteLength(data) } : {}) },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on("data", (c: Buffer) => {
          size += c.length
          // An export is the biggest answer; anything over 8 MB isn't one of ours.
          if (size > 8 * 1024 * 1024) req.destroy(new Error("too-big"))
          else chunks.push(c)
        })
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          let json: unknown = null
          try {
            json = text ? JSON.parse(text) : null
          } catch {
            json = text
          }
          const code = res.statusCode ?? 0
          if (code === 401) return reject(new RestError("auth"))
          if (code >= 400) return reject(new RestError(`http-${code}`, typeof json === "object" && json && "detail" in json ? String((json as { detail: unknown }).detail).slice(0, 200) : ""))
          resolve(json)
        })
      }
    )
    req.on("timeout", () => req.destroy(new RestError("timeout")))
    req.on("error", (e) => reject(e instanceof RestError ? e : new RestError("unreachable", e.message.slice(0, 160))))
    req.end(data)
  })
}

const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])

// ── Live view ───────────────────────────────────────────────────────────────

export type LiveView = {
  resource: { board: string; version: string; uptime: string; cpu: number; memUsed: number; memTotal: number }
  interfaces: { name: string; type: string; running: boolean; disabled: boolean; rx: number; tx: number }[]
  sessions: { name: string; address: string; uptime: string; callerId: string }[]
  log: { time: string; topics: string; message: string }[]
}

export async function liveView(routerId: string): Promise<LiveView> {
  const [res, ifs, act, log] = await Promise.all([restCall(routerId, "GET", "/system/resource"), restCall(routerId, "GET", "/interface"), restCall(routerId, "GET", "/ppp/active"), restCall(routerId, "GET", "/log")])
  const rs = (res ?? {}) as Record<string, unknown>
  const interfaces = list(ifs)
    .filter((i) => !String(i.type).startsWith("pppoe-in"))
    .map((i) => ({ name: String(i.name ?? ""), type: String(i.type ?? ""), running: bool(i.running), disabled: bool(i.disabled), rx: 0, tx: 0 }))
  // Live rates of the running ones (one command for up to 12).
  const watch = interfaces.filter((i) => i.running && !i.disabled).slice(0, 12)
  if (watch.length) {
    try {
      const rates = list(await restCall(routerId, "POST", "/interface/monitor-traffic", { interface: watch.map((i) => i.name).join(","), once: "" }))
      for (const r of rates) {
        const i = interfaces.find((x) => x.name === r.name)
        if (i) {
          i.rx = num(r["rx-bits-per-second"])
          i.tx = num(r["tx-bits-per-second"])
        }
      }
    } catch {
      // Rates are a bonus: the view works without them.
    }
  }
  return {
    resource: { board: String(rs["board-name"] ?? ""), version: String(rs.version ?? ""), uptime: String(rs.uptime ?? ""), cpu: num(rs["cpu-load"]), memUsed: num(rs["total-memory"]) - num(rs["free-memory"]), memTotal: num(rs["total-memory"]) },
    interfaces,
    sessions: list(act).map((a) => ({ name: String(a.name ?? ""), address: String(a.address ?? ""), uptime: String(a.uptime ?? ""), callerId: String(a["caller-id"] ?? "") })),
    log: list(log)
      .slice(-60)
      .reverse()
      .map((l) => ({ time: String(l.time ?? ""), topics: String(l.topics ?? ""), message: String(l.message ?? "") })),
  }
}

// ── Client lookup ───────────────────────────────────────────────────────────

export type ClientLive = {
  user: string
  secret: { profile: string; disabled: boolean; lastLoggedOut: string; lastDisconnect: string } | null
  session: { address: string; uptime: string; callerId: string } | null
  rate: { rx: number; tx: number } | null
}

export async function clientLive(routerId: string, user: string): Promise<ClientLive> {
  if (!safe(user)) throw new RestError("bad-user")
  const q = `?name=${encodeURIComponent(user)}`
  const [sec, act] = await Promise.all([restCall(routerId, "GET", `/ppp/secret${q}`), restCall(routerId, "GET", `/ppp/active${q}`)])
  const s = list(sec)[0]
  const a = list(act)[0]
  let rate: ClientLive["rate"] = null
  if (a) {
    try {
      const r = list(await restCall(routerId, "POST", "/interface/monitor-traffic", { interface: `<pppoe-${user}>`, once: "" }))[0]
      // From the router's side: what it sends the client (tx) is the client's download.
      if (r) rate = { rx: num(r["rx-bits-per-second"]), tx: num(r["tx-bits-per-second"]) }
    } catch {
      rate = null
    }
  }
  return {
    user,
    secret: s ? { profile: String(s.profile ?? ""), disabled: bool(s.disabled), lastLoggedOut: String(s["last-logged-out"] ?? ""), lastDisconnect: String(s["last-disconnect-reason"] ?? "") } : null,
    session: a ? { address: String(a.address ?? ""), uptime: String(a.uptime ?? ""), callerId: String(a["caller-id"] ?? "") } : null,
    rate,
  }
}

// ── Staff actions (write) ───────────────────────────────────────────────────

export const REST_ACTIONS = ["suspend", "reconnect", "plan", "kick", "disable", "enable"] as const
export type RestAction = (typeof REST_ACTIONS)[number]

/** The client and service a PPPoE user belongs to (to keep Clientes in step), or null. */
async function serviceOf(user: string): Promise<{ clientId: string; serviceId: string; plan: string } | null> {
  const rows = (await getPool().query(`select id, data from clients where deleted_at is null and data::text like $1`, [`%${user.replace(/[%_]/g, "")}%`])).rows as { id: string; data: unknown }[]
  for (const r of rows) {
    const c = decodeClient(r.data)
    const s = c?.services.find((x) => x.type === "internet" && x.pppoeUser.trim() === user)
    if (s) return { clientId: r.id, serviceId: s.id, plan: s.plan.trim() }
  }
  return null
}

/** A staff action on a PPPoE user, logged in the router's actions (source "rest"). Answers what was done. */
export async function restAct(routerId: string, action: RestAction, user: string, arg: string, by: string): Promise<string> {
  if (!safe(user) || (arg && !safe(arg))) throw new RestError("bad-user")
  const svc = await serviceOf(user)
  const secret = list(await restCall(routerId, "GET", `/ppp/secret?name=${encodeURIComponent(user)}`))[0]
  if (!secret) throw new RestError("no-secret")
  const id = String(secret[".id"] ?? "")
  const kick = async () => {
    for (const a of list(await restCall(routerId, "GET", `/ppp/active?name=${encodeURIComponent(user)}`))) await restCall(routerId, "DELETE", `/ppp/active/${String(a[".id"])}`)
  }
  let profile = ""
  if (action === "suspend") profile = SUSPENDED_PROFILE
  if (action === "reconnect") profile = svc?.plan || arg
  if (action === "plan") profile = arg
  if ((action === "reconnect" || action === "plan") && !safe(profile)) throw new RestError("no-plan")
  let error = ""
  try {
    if (profile) await restCall(routerId, "PATCH", `/ppp/secret/${id}`, { profile })
    if (action === "disable") await restCall(routerId, "PATCH", `/ppp/secret/${id}`, { disabled: "true" })
    if (action === "enable") await restCall(routerId, "PATCH", `/ppp/secret/${id}`, { disabled: "false" })
    if (action !== "enable") await kick()
  } catch (e) {
    error = e instanceof RestError ? e.code : "error"
    throw e
  } finally {
    const kind = profile ? "profile" : action === "kick" ? "kick" : action
    await getPool().query(
      `insert into router_actions (router_id, kind, "user", arg1, client_id, service_id, source, status, result, created_by, sent_at, done_at) values ($1, $2, $3, $4, $5, $6, 'rest', $7, $8, $9, now(), now())`,
      [routerId, kind, user, profile, svc?.clientId ?? "", svc?.serviceId ?? "", error ? "error" : "done", error, by]
    )
  }
  // Suspended or back on the plan: Clientes follows (Cortes, the portal and Hoy read it).
  if (svc && (action === "suspend" || action === "reconnect")) await setServiceStatus(svc.clientId, svc.serviceId, action === "suspend" ? "suspendido" : "activo")
  return profile ? `${action}:${profile}` : action
}

// ── Config backups ──────────────────────────────────────────────────────────

/** Reads the router's configuration (/export terse, read-only) and keeps it; the last 20 per router stay. */
export async function backupNow(routerId: string, by: string): Promise<{ id: string; size: number }> {
  const out = (await restCall(routerId, "POST", "/execute", { script: EXPORT_SCRIPT, "as-string": "" })) as Record<string, unknown> | string | null
  const text = typeof out === "string" ? out : typeof out?.ret === "string" ? out.ret : ""
  if (!text.trim()) throw new RestError("empty-export")
  const pool = getPool()
  const id = String(((await pool.query(`insert into router_backups (router_id, text, created_by) values ($1, $2, $3) returning id`, [routerId, text, by])).rows[0] as { id: string }).id)
  await pool.query(`delete from router_backups where router_id = $1 and id not in (select id from router_backups where router_id = $1 order by created_at desc limit 20)`, [routerId])
  return { id, size: text.length }
}

export async function backupsOf(routerId: string) {
  return (await getPool().query(`select id, created_at, created_by, length(text) as size from router_backups where router_id = $1 order by created_at desc`, [routerId])).rows as { id: string; created_at: Date; created_by: string; size: number }[]
}

export async function backupText(id: string): Promise<{ routerId: string; text: string; createdAt: Date } | null> {
  const r = (await getPool().query(`select router_id, text, created_at from router_backups where id = $1`, [id])).rows[0] as { router_id: string; text: string; created_at: Date } | undefined
  return r ? { routerId: r.router_id, text: r.text, createdAt: r.created_at } : null
}
