/**
 * Staff access to the routers on the server (rules in lib/wispdavor/rest.ts, API wire format in ros-api.ts): each
 * router's settings with its passwords encrypted (AES-256-GCM, key ROUTER_CRED_KEY on the host; never sent to a
 * browser), one operation at a time over the router's chosen mode (REST or MikroTik API over TLS) with the read-only
 * check in front, and what staff use: live view, client lookup, actions (logged like the agent's) and config backups.
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
import { todayInMexico } from "../lead"
import { loadClient, loadPayments } from "./db-server"
import { SUSPENDED_PROFILE, desiredUsers, safe } from "./routers"
import { setServiceHold, setServiceStatus } from "./routers-server"
import { EXPORT_SCRIPT, PROTOCOLS, bool, isReadOp, normalizeFingerprint, num, opProblem, opToApi, opToRest, validHost, type Op, type Protocol } from "./rest"
import { collectReply, encodeSentence, readSentences } from "./ros-api"

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

type Row = { router_id: string; protocol: string; host: string; port: number; api_port: number; read_user: string; read_pass: string; write_user: string; write_pass: string; fingerprint: string; read_only: boolean; updated_at: Date; updated_by: string }
/** What a browser may see: no passwords, only whether they're set. */
export type RestView = { protocol: Protocol; host: string; port: number; apiPort: number; readUser: string; writeUser: string; hasReadPass: boolean; hasWritePass: boolean; fingerprint: string; readOnly: boolean; updatedAt: string; updatedBy: string }

const row = async (routerId: string) => (await getPool().query(`select * from router_rest where router_id = $1`, [routerId])).rows[0] as Row | undefined
const protocolOf = (p: string): Protocol => (p === "api" ? "api" : "rest")

export async function restViews(): Promise<Record<string, RestView>> {
  const rows = (await getPool().query(`select * from router_rest`)).rows as Row[]
  return Object.fromEntries(
    rows.map((r) => [
      r.router_id,
      { protocol: protocolOf(r.protocol), host: r.host, port: r.port, apiPort: r.api_port, readUser: r.read_user, writeUser: r.write_user, hasReadPass: !!r.read_pass, hasWritePass: !!r.write_pass, fingerprint: r.fingerprint, readOnly: r.read_only, updatedAt: r.updated_at.toISOString(), updatedBy: r.updated_by },
    ])
  )
}

export type RestInput = { protocol?: string; host?: string; port?: number; apiPort?: number; readUser?: string; readPass?: string; writeUser?: string; writePass?: string; clearWrite?: boolean; fingerprint?: string; readOnly?: boolean }

/** Saves a router's connection settings; a blank password keeps the saved one. Answers an error code or null. */
export async function saveRest(routerId: string, i: RestInput, by: string): Promise<string | null> {
  const cur = await row(routerId)
  if (i.protocol !== undefined && !(PROTOCOLS as readonly string[]).includes(i.protocol)) return "protocol-choice"
  const protocol = protocolOf(i.protocol ?? cur?.protocol ?? "rest")
  const host = (i.host ?? cur?.host ?? "").trim().toLowerCase()
  const port = Math.round(i.port ?? cur?.port ?? 443)
  const apiPort = Math.round(i.apiPort ?? cur?.api_port ?? 8729)
  if (host && !validHost(host)) return "host"
  if (!(port >= 1 && port <= 65535) || !(apiPort >= 1 && apiPort <= 65535)) return "port"
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
    `insert into router_rest (router_id, protocol, host, port, api_port, read_user, read_pass, write_user, write_pass, fingerprint, read_only, updated_at, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), $12)
     on conflict (router_id) do update set protocol = $2, host = $3, port = $4, api_port = $5, read_user = $6, read_pass = $7, write_user = $8, write_pass = $9,
       fingerprint = $10, read_only = $11, updated_at = now(), updated_by = $12`,
    [routerId, protocol, host, port, apiPort, readUser, readPass, writeUser, writePass, fp, readOnly, by]
  )
  return null
}

// ── Connection ──────────────────────────────────────────────────────────────

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
      reject(new RestError(code, e instanceof Error ? e.message.slice(0, 160) : typeof e === "string" ? e : ""))
    }
    sock.once("secureConnect", () => {
      if (fingerprint) {
        const got = normalizeFingerprint(sock.getPeerCertificate().fingerprint256 ?? "")
        if (got !== fingerprint) return fail("cert-mismatch", `huella recibida ${got.slice(0, 16)}…`)
      }
      sock.setTimeout(0)
      resolve(sock)
    })
    sock.once("timeout", () => fail("timeout"))
    // A router without a certificate offers only anonymous ciphers (manual): the handshake fails.
    sock.once("error", (e: NodeJS.ErrnoException) => fail(/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/.test(e.code ?? e.message) ? "cert" : /handshake|SSL|alert/i.test(e.message) ? "tls" : e.code === "ENOTFOUND" ? "dns" : "unreachable", e))
  })
}

type Records = Record<string, string>[]

/** One REST request; the reply as records (REST gives an array, one object, or nothing). */
function viaRest(r: Row, user: string, pass: string, op: Op, sock: TLSSocket): Promise<Records> {
  const { method, path, body } = opToRest(op)
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
          const detail = typeof json === "object" && json && "detail" in json ? String((json as { detail: unknown }).detail).slice(0, 200) : ""
          // Manual: 401 = wrong password or no rest-api policy; 500 "not allowed (9)" = rest-api without api.
          if (code === 401) return reject(new RestError("auth"))
          if (code >= 400) return reject(new RestError(/not enough permissions|not allowed/.test(detail) ? "denied" : `http-${code}`, detail))
          resolve(Array.isArray(json) ? (json as Records) : json && typeof json === "object" ? [json as Record<string, string>] : [])
        })
      }
    )
    req.on("timeout", () => req.destroy(new RestError("timeout")))
    req.on("error", (e) => reject(e instanceof RestError ? e : new RestError("unreachable", e.message.slice(0, 160))))
    req.end(data)
  })
}

const trapCode = (m: string) => (/not enough permissions|not allowed/.test(m) ? "denied" : /no such item|no such command/.test(m) ? "not-found" : "trap")

/**
 * One MikroTik API session over TLS: login once (plain text, inside TLS), then any number of commands one after the
 * other, then close. One session per screen keeps the router's API sessions (max-sessions) and handshakes down.
 */
async function apiSession(host: string, port: number, fingerprint: string, user: string, pass: string) {
  const sock = await tlsConnect(host, port, fingerprint)
  let buf: Buffer = Buffer.alloc(0)
  let pending: string[][] = []
  let size = 0
  let dead: RestError | null = null
  let waiter: { tag: string; resolve: (r: ReturnType<typeof collectReply>) => void; reject: (e: RestError) => void; timer: ReturnType<typeof setTimeout> } | null = null
  let nextTag = 0
  const kill = (e: RestError) => {
    dead ??= e
    const w = waiter
    waiter = null
    if (w) {
      clearTimeout(w.timer)
      w.reject(e)
    }
    sock.destroy()
  }
  sock.on("data", (chunk: Buffer) => {
    size += chunk.length
    if (size > 8 * 1024 * 1024) return kill(new RestError("too-big"))
    buf = Buffer.concat([buf, chunk])
    let read: ReturnType<typeof readSentences>
    try {
      read = readSentences(buf)
    } catch {
      return kill(new RestError("protocol"))
    }
    buf = read.rest
    pending = [...pending, ...read.sentences]
    // Each command has its own .tag: replies to anything else (a late one) are left out.
    const reply = collectReply(pending, waiter?.tag ?? "")
    if (!reply.finished) return
    pending = []
    size = 0
    if (reply.fatal) return kill(new RestError("fatal", reply.fatal))
    const w = waiter
    waiter = null
    if (w) {
      clearTimeout(w.timer)
      w.resolve(reply)
    }
  })
  sock.on("error", (e) => kill(new RestError("unreachable", e.message.slice(0, 160))))
  sock.on("close", () => kill(new RestError("closed")))
  const send = (words: string[]) =>
    new Promise<ReturnType<typeof collectReply>>((resolve, reject) => {
      if (dead) return reject(dead)
      const tag = String(++nextTag)
      waiter = { tag, resolve, reject, timer: setTimeout(() => kill(new RestError("timeout")), TIMEOUT_MS) }
      sock.write(encodeSentence([...words, `.tag=${tag}`]))
    })
  const login = await send(["/login", `=name=${user}`, `=password=${pass}`])
  if (login.trap) {
    sock.destroy()
    throw new RestError(/invalid user name or password|not allowed/i.test(login.trap) ? "auth" : "trap", login.trap)
  }
  return {
    async run(op: Op): Promise<Records> {
      const r = await send(opToApi(op))
      if (r.trap) throw new RestError(trapCode(r.trap), r.trap)
      // A command with no records (execute, set) answers in !done's attributes (=ret=…).
      return r.records.length ? r.records : r.done && Object.keys(r.done).length ? [r.done] : []
    },
    close: () => {
      sock.end()
      sock.destroy()
    },
  }
}

type Call = (op: Op) => Promise<Records>

/**
 * A connection to a router over its chosen mode, for one screen's worth of operations. `write`: whether any of them
 * changes something; then the router must not be in read-only mode and a write user must be set, and the write user is
 * used; otherwise the read user, and a write slipping in is refused before it leaves.
 */
export async function withRouter<T>(routerId: string, write: boolean, fn: (call: Call) => Promise<T>): Promise<T> {
  const r = await row(routerId)
  if (!r?.host) throw new RestError("not-configured")
  if (write && r.read_only) throw new RestError("read-only")
  const user = write ? r.write_user : r.read_user
  const sealed = write ? r.write_pass : r.read_pass
  if (!user || !sealed) throw new RestError(write ? "no-write-user" : "no-read-user")
  const pass = open(sealed)
  // Saved but unreadable: ROUTER_CRED_KEY is missing or changed since it was saved.
  if (!pass) throw new RestError(credKeySet() ? "key-changed" : "no-key")
  const check = (op: Op) => {
    const bad = opProblem(op)
    if (bad) throw new RestError("bad-op", bad)
    if (!write && !isReadOp(op)) throw new RestError("read-only")
  }
  if (protocolOf(r.protocol) === "api") {
    const s = await apiSession(r.host, r.api_port, r.fingerprint, user, pass)
    try {
      return await fn(async (op) => {
        check(op)
        return s.run(op)
      })
    } finally {
      s.close()
    }
  }
  return fn(async (op) => {
    check(op)
    return viaRest(r, user, pass, op, await tlsConnect(r.host, r.port, r.fingerprint))
  })
}

/** One operation on a router (its own connection). */
export const routerCall = (routerId: string, op: Op) => withRouter(routerId, !isReadOp(op), (call) => call(op))

const first = (rs: Records) => rs[0] ?? {}

// ── Live view ───────────────────────────────────────────────────────────────

export type LiveView = {
  protocol: Protocol
  resource: { board: string; version: string; uptime: string; cpu: number; memUsed: number; memTotal: number }
  interfaces: { name: string; type: string; running: boolean; disabled: boolean; rx: number; tx: number }[]
  sessions: { name: string; address: string; uptime: string; callerId: string }[]
  log: { time: string; topics: string; message: string }[]
}

const RATE_PROPS = ["name", "rx-bits-per-second", "tx-bits-per-second"]

/** A test: the router's model and version (with the read user). */
export async function testRouter(routerId: string) {
  const rs = first(await routerCall(routerId, { kind: "print", menu: "/system/resource" }))
  return { version: String(rs.version ?? ""), board: String(rs["board-name"] ?? "") }
}

export async function liveView(routerId: string): Promise<LiveView> {
  return withRouter(routerId, false, (call) => liveWith(routerId, call))
}

async function liveWith(routerId: string, call: Call): Promise<LiveView> {
  // One after the other on one connection (the API takes one command at a time per session).
  const res = first(await call({ kind: "print", menu: "/system/resource" }))
  const ifs = await call({ kind: "print", menu: "/interface", proplist: ["name", "type", "running", "disabled"] })
  const act = await call({ kind: "print", menu: "/ppp/active", proplist: ["name", "address", "uptime", "caller-id"] })
  const log = await call({ kind: "print", menu: "/log", proplist: ["time", "topics", "message"] })
  const interfaces = ifs
    .filter((i) => !String(i.type).startsWith("pppoe-in"))
    .map((i) => ({ name: String(i.name ?? ""), type: String(i.type ?? ""), running: bool(i.running), disabled: bool(i.disabled), rx: 0, tx: 0 }))
  // Live rates of the running ones (one command for up to 12; "once" so it answers right away).
  const watch = interfaces.filter((i) => i.running && !i.disabled).slice(0, 12)
  if (watch.length) {
    try {
      for (const r of await call({ kind: "cmd", menu: "/interface", cmd: "monitor-traffic", params: { interface: watch.map((i) => i.name).join(","), once: "" }, proplist: RATE_PROPS })) {
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
  const r = await row(routerId)
  return {
    protocol: protocolOf(r?.protocol ?? "rest"),
    resource: { board: String(res["board-name"] ?? ""), version: String(res.version ?? ""), uptime: String(res.uptime ?? ""), cpu: num(res["cpu-load"]), memUsed: num(res["total-memory"]) - num(res["free-memory"]), memTotal: num(res["total-memory"]) },
    interfaces,
    sessions: act.map((a) => ({ name: String(a.name ?? ""), address: String(a.address ?? ""), uptime: String(a.uptime ?? ""), callerId: String(a["caller-id"] ?? "") })),
    log: log
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
  return withRouter(routerId, false, (call) => clientWith(call, user))
}

async function clientWith(call: Call, user: string): Promise<ClientLive> {
  const s = (await call({ kind: "print", menu: "/ppp/secret", where: { name: user } }))[0]
  const a = (await call({ kind: "print", menu: "/ppp/active", where: { name: user } }))[0]
  let rate: ClientLive["rate"] = null
  if (a) {
    try {
      const r = (await call({ kind: "cmd", menu: "/interface", cmd: "monitor-traffic", params: { interface: `<pppoe-${user}>`, once: "" }, proplist: RATE_PROPS }))[0]
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
  const rows = (await getPool().query(`select id, data from clients where deleted_at is null and data::text like $1`, [`%${user.replace(/[%_\\]/g, "")}%`])).rows as { id: string; data: unknown }[]
  for (const r of rows) {
    const c = decodeClient(r.data)
    const s = c?.services.find((x) => x.type === "internet" && x.pppoeUser.trim() === user)
    if (s) return { clientId: r.id, serviceId: s.id, plan: s.plan.trim() }
  }
  return null
}

/** A staff action on a PPPoE user, logged in the router's actions (source "rest" or "api"). Answers what was done. */
export async function restAct(routerId: string, action: RestAction, user: string, arg: string, by: string): Promise<string> {
  if (!safe(user) || (arg && !safe(arg))) throw new RestError("bad-user")
  const svc = await serviceOf(user)
  const mode = protocolOf((await row(routerId))?.protocol ?? "rest")
  let profile = ""
  if (action === "suspend") profile = SUSPENDED_PROFILE
  if (action === "reconnect") profile = svc?.plan || arg
  if (action === "plan") profile = arg
  if ((action === "reconnect" || action === "plan") && !safe(profile)) throw new RestError("no-plan")
  // What Clientes and Cobranza say this user should be (the agent's rules), and whether the router is on automatic:
  // a change against them would be undone at its next report, so it's refused with what to do instead.
  const auto = (((await getPool().query(`select auto and pppoe as auto from routers where id = $1`, [routerId])).rows[0] as { auto: boolean } | undefined)?.auto) ?? false
  const client = svc ? await loadClient(svc.clientId) : null
  const desired = client ? desiredUsers([client], await loadPayments(client.id), todayInMexico()).find((d) => d.user === user) : undefined
  let error = ""
  try {
    if (auto && desired) {
      if (action === "reconnect" && desired.suspended && !(client?.services.find((s) => s.id === svc?.serviceId)?.hold)) throw new RestError("auto-late")
      // A new plan would also lift a suspension the agent keeps: refused while suspended too.
      if (action === "plan" && !desired.disabled && (desired.suspended || profile !== desired.plan)) throw new RestError("auto-plan")
      if (action === "disable" && !desired.disabled) throw new RestError("auto-disable")
      if (action === "enable" && desired.disabled) throw new RestError("auto-enable")
    }
    await withRouter(routerId, true, async (call) => {
      const secret = (await call({ kind: "print", menu: "/ppp/secret", where: { name: user }, proplist: [".id", "name"] }))[0]
      if (!secret) throw new RestError("no-secret")
      const id = String(secret[".id"] ?? "")
      if (profile) await call({ kind: "set", menu: "/ppp/secret", id, props: { profile } })
      if (action === "disable" || action === "enable") await call({ kind: "set", menu: "/ppp/secret", id, props: { disabled: action === "disable" ? "yes" : "no" } })
      // Drop the session so the change applies now (not for enable: there's none).
      if (action !== "enable") for (const a of await call({ kind: "print", menu: "/ppp/active", where: { name: user }, proplist: [".id"] })) await call({ kind: "remove", menu: "/ppp/active", id: String(a[".id"]) })
    })
  } catch (e) {
    error = e instanceof RestError ? e.code : "error"
    throw e
  } finally {
    const kind = profile ? "profile" : action === "kick" ? "kick" : action
    await getPool().query(
      `insert into router_actions (router_id, kind, "user", arg1, client_id, service_id, source, status, result, created_by, sent_at, done_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())`,
      [routerId, kind, user, profile, svc?.clientId ?? "", svc?.serviceId ?? "", mode, error ? "error" : "done", error, by]
    )
  }
  // Suspended or back on the plan: Clientes follows (Cortes, the portal and Hoy read it). Suspending someone who owes
  // nothing is a manual hold (not for debt): not charged, and nothing reconnects them by itself.
  if (svc && action === "suspend") {
    if (desired && !desired.suspended) await setServiceHold(svc.clientId, svc.serviceId)
    else await setServiceStatus(svc.clientId, svc.serviceId, "suspendido")
  }
  if (svc && action === "reconnect") await setServiceStatus(svc.clientId, svc.serviceId, "activo")
  return profile ? `${action}:${profile}` : action
}

// ── Config backups ──────────────────────────────────────────────────────────

/** Reads the router's configuration (/export terse through /execute as-string, read-only) and keeps the last 20. */
export async function backupNow(routerId: string, by: string): Promise<{ id: string; size: number }> {
  const out = first(await routerCall(routerId, { kind: "cmd", menu: "", cmd: "execute", params: { script: EXPORT_SCRIPT, "as-string": "" } }))
  const text = typeof out.ret === "string" ? out.ret : ""
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
