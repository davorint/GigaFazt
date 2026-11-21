// A fake RouterOS for testing WispDavor: REST on https://127.0.0.1:18443 and the MikroTik API over TLS on 18729, same
// data and users: "lectura" (read only: any change is refused) and "escritura" (read and write).
const https = require("node:https")
const tls = require("node:tls")
const fs = require("node:fs")
const path = require("node:path")
const dir = process.env.FAKE_DIR || __dirname
const key = fs.readFileSync(path.join(dir, "key.pem"))
const cert = fs.readFileSync(path.join(dir, "cert.pem"))
const users = { lectura: "pass-lectura", escritura: "pass-escritura" }
const secrets = [{ ".id": "*1", name: "fakeuser", profile: "200M", disabled: "false", "last-logged-out": "nov/20/2026 10:00:00", "last-disconnect-reason": "peer-request" }]
const active = [{ ".id": "*A", name: "fakeuser", address: "10.10.0.2", uptime: "1h2m", "caller-id": "AA:BB:CC:DD:EE:FF", service: "pppoe" }]
const log = []
const resource = { "board-name": "CCR2004-FAKE", version: "7.25.1 (stable)", uptime: "3d4h", "cpu-load": "7", "free-memory": "3221225472", "total-memory": "4294967296" }
const interfaces = [{ name: "ether1", type: "ether", running: "true", disabled: "false" }, { name: "ether2", type: "ether", running: "false", disabled: "false" }, { name: "<pppoe-fakeuser>", type: "pppoe-in", running: "true", disabled: "false" }]
const rates = (names) => names.split(",").map((n) => ({ name: n, "rx-bits-per-second": "1500000", "tx-bits-per-second": "25000000" }))
const EXPORT = "# fake export\n/interface ethernet set [ find default-name=ether1 ] comment=WAN\n"

// ── REST ──
https
  .createServer({ key, cert }, (req, res) => {
    const auth = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString()
    const [u, p] = auth.split(":")
    const send = (code, body) => {
      res.writeHead(code, { "content-type": "application/json" })
      res.end(body === null ? "" : JSON.stringify(body))
    }
    if (!users[u] || users[u] !== p) return send(401, { error: 401, message: "Unauthorized" })
    let body = ""
    req.on("data", (c) => (body += c))
    req.on("end", () => {
      const url = new URL(req.url, "https://x")
      const p2 = url.pathname
      const json = body ? JSON.parse(body) : {}
      const readCmd = req.method === "POST" && (p2 === "/rest/interface/monitor-traffic" || (p2 === "/rest/execute" && json.script === "/export terse"))
      if (u === "lectura" && req.method !== "GET" && !readCmd) return send(500, { error: 500, message: "Internal Server Error", detail: "not enough permissions (9)" })
      log.push(`REST ${u} ${req.method} ${p2}`)
      const name = url.searchParams.get("name")
      if (req.method === "GET" && p2 === "/rest/system/resource") return send(200, resource)
      if (req.method === "GET" && p2 === "/rest/interface") return send(200, interfaces)
      if (req.method === "GET" && p2 === "/rest/ppp/active") return send(200, active.filter((a) => !name || a.name === name))
      if (req.method === "GET" && p2 === "/rest/ppp/secret") return send(200, secrets.filter((s) => !name || s.name === name))
      if (req.method === "GET" && p2 === "/rest/log") return send(200, [{ time: "10:00:00", topics: "system,info", message: "fake log" }])
      if (req.method === "POST" && p2 === "/rest/interface/monitor-traffic") return send(200, rates(String(json.interface)))
      if (req.method === "POST" && p2 === "/rest/execute") return send(200, { ret: EXPORT })
      if (req.method === "PATCH" && p2.startsWith("/rest/ppp/secret/")) return send(200, Object.assign(secrets.find((x) => x[".id"] === p2.split("/").pop()), json))
      if (req.method === "DELETE" && p2.startsWith("/rest/ppp/active/")) {
        const i = active.findIndex((x) => x[".id"] === p2.split("/").pop())
        if (i < 0) return send(404, { error: 404, message: "Not Found" })
        active.splice(i, 1)
        return send(204, null)
      }
      if (req.method === "GET" && p2 === "/rest/_state") return send(200, { secrets, active, log })
      if (req.method === "POST" && p2 === "/rest/_reset") {
        if (!active.length) active.push({ ".id": "*A", name: "fakeuser", address: "10.10.0.2", uptime: "1h2m", "caller-id": "AA:BB:CC:DD:EE:FF", service: "pppoe" })
        secrets[0].profile = "200M"
        secrets[0].disabled = "false"
        return send(200, { ok: true })
      }
      send(404, { error: 404, message: "Not Found" })
    })
  })
  .listen(18443, "127.0.0.1")

// ── API over TLS ──
function encLen(n) {
  if (n < 0x80) return Buffer.from([n])
  if (n < 0x4000) return Buffer.from([(n >> 8) | 0x80, n & 0xff])
  if (n < 0x200000) return Buffer.from([(n >> 16) | 0xc0, (n >> 8) & 0xff, n & 0xff])
  return Buffer.from([(n >>> 24) | 0xe0, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])
}
const sentence = (words) => Buffer.concat([...words.flatMap((w) => [encLen(Buffer.byteLength(w)), Buffer.from(w)]), Buffer.from([0])])
function read(buf) {
  const out = []
  let at = 0, words = [], start = 0
  for (;;) {
    if (at >= buf.length) break
    const c = buf[at]
    const size = c < 0x80 ? 1 : c < 0xc0 ? 2 : c < 0xe0 ? 3 : 4
    if (buf.length < at + size) break
    const n = size === 1 ? c : size === 2 ? ((c & 0x3f) << 8) | buf[at + 1] : size === 3 ? ((c & 0x1f) << 16) | (buf[at + 1] << 8) | buf[at + 2] : ((c & 0x0f) << 24) | (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3]
    if (buf.length < at + size + n) break
    const w = buf.subarray(at + size, at + size + n).toString()
    at += size + n
    if (n === 0) {
      if (words.length) out.push(words)
      words = []
      start = at
    } else words.push(w)
  }
  return { out, rest: buf.subarray(start) }
}
tls
  .createServer({ key, cert }, (sock) => {
    log.push("API connect")
    let buf = Buffer.alloc(0)
    let user = ""
    let tag = []
    // Manual: every reply to a tagged sentence carries its .tag; an empty print answers !empty then !done.
    const reply = (rows, done = [], empty = false) => {
      if (empty && !rows.length) sock.write(sentence(["!empty", ...tag]))
      for (const r of rows) sock.write(sentence(["!re", ...Object.entries(r).map(([k, v]) => `=${k}=${v}`), ...tag]))
      sock.write(sentence(["!done", ...done, ...tag]))
    }
    const trap = (m) => sock.write(Buffer.concat([sentence(["!trap", `=message=${m}`, ...tag]), sentence(["!done", ...tag])]))
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d])
      const r = read(buf)
      buf = r.rest
      for (const s of r.out) {
        const cmd = s[0]
        tag = s.filter((w) => w.startsWith(".tag="))
        const attrs = Object.fromEntries(s.filter((w) => w.startsWith("=")).map((w) => [w.slice(1, w.indexOf("=", 1)), w.slice(w.indexOf("=", 1) + 1)]))
        const q = Object.fromEntries(s.filter((w) => w.startsWith("?")).map((w) => [w.slice(1, w.indexOf("=")), w.slice(w.indexOf("=") + 1)]))
        if (cmd === "/login") {
          if (users[attrs.name] && users[attrs.name] === attrs.password) {
            user = attrs.name
            reply([])
          } else trap("invalid user name or password (6)")
          continue
        }
        if (!user) {
          trap("not logged in")
          continue
        }
        const writes = ["/ppp/secret/set", "/ppp/active/remove"].includes(cmd) || (cmd === "/execute" && attrs.script !== "/export terse")
        if (writes && user === "lectura") {
          trap("not enough permissions (9)")
          continue
        }
        log.push(`API ${user} ${cmd}`)
        const where = (list) => list.filter((x) => Object.entries(q).every(([k, v]) => x[k] === v))
        if (cmd === "/system/resource/print") reply([resource])
        else if (cmd === "/interface/print") reply(where(interfaces))
        else if (cmd === "/ppp/active/print") reply(where(active), [], true)
        else if (cmd === "/ppp/secret/print") reply(where(secrets), [], true)
        else if (cmd === "/log/print") reply([{ time: "10:00:00", topics: "system,info", message: "fake api log" }])
        else if (cmd === "/interface/monitor-traffic") reply(rates(attrs.interface))
        else if (cmd === "/execute") reply([], [`=ret=${EXPORT}`])
        else if (cmd === "/ppp/secret/set") {
          const x = secrets.find((y) => y[".id"] === attrs[".id"])
          if (!x) trap("no such item")
          else {
            for (const [k, v] of Object.entries(attrs)) if (k !== ".id") x[k] = v === "yes" ? "true" : v === "no" ? "false" : v
            reply([])
          }
        } else if (cmd === "/ppp/active/remove") {
          const i = active.findIndex((y) => y[".id"] === attrs[".id"])
          if (i < 0) trap("no such item")
          else {
            active.splice(i, 1)
            reply([])
          }
        } else trap("no such command prefix")
      }
    })
    sock.on("error", () => {})
  })
  .listen(18729, "127.0.0.1", () => console.log("fake router ready (REST 18443, API 18729)"))
