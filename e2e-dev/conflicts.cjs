// Router en vivo vs the automatic switch (2026-11-21 review): with "Automático" on, a change the agent would undo is
// refused (409 with what to do instead); suspending someone who owes nothing is a manual hold (not charged, not undone);
// with "Automático" off, staff decide. Against the fake router (REST). Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const fs = require("node:fs"), path = require("node:path")
const https = require("node:https")
const SP = process.env.SP, BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const fp = fs.readFileSync(path.join(SP, "fakeros", "fp.txt"), "utf8").trim()
const CID = "wdtest-cf-client"
const now = new Date().toISOString()
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: now })
const api = async (body) => {
  const r = await fetch(BASE + "/api/interno/routers/rest", { method: "POST", headers: H, body: JSON.stringify(body) })
  const b = await r.json()
  return `${r.status} ${b.error ?? b.done ?? "ok"}`
}
// Puts the fake router's session and profile back between steps.
const reset = () =>
  new Promise((resolve) => {
    const r = https.request({ host: "127.0.0.1", port: 18443, method: "POST", path: "/rest/_reset", ca: fs.readFileSync(path.join(SP, "fakeros", "cert.pem")), servername: "fake-router", checkServerIdentity: () => undefined, headers: { authorization: "Basic " + Buffer.from("escritura:pass-escritura").toString("base64"), "content-type": "application/json" } }, (res) => { res.resume(); res.on("end", resolve) })
    r.on("error", resolve)
    r.end("{}")
  })

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  // Late: billed since September, nothing paid.
  const client = { id: CID, kind: "residencial", name: "Prueba Conflictos", phone: "", siteId: "", billingFrom: "2026-09", services: [{ id: "wdtest-cf-svc", type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-09-01", pppoeUser: "fakeuser" }], createdAt: now, updatedAt: now }
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [change(client)] }) })
  const c = await (await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Prueba Conflictos", siteId: "", pppoe: true }) })).json()
  const id = c.router.id
  await api({ action: "save", id, protocol: "rest", host: "127.0.0.1", port: 18443, readUser: "lectura", readPass: "pass-lectura", writeUser: "escritura", writePass: "pass-escritura", fingerprint: fp })
  await api({ action: "save", id, readOnly: false })
  await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "update", id, auto: true }) })
  const svc = async () => (await db.query(`select data->'services'->0 as s from clients where id = $1`, [CID])).rows[0].s
  await reset()
  console.log("auto, late: reconnect:", await api({ action: "act", id, act: "reconnect", user: "fakeuser" }))
  console.log("auto: plan 500M:", await api({ action: "act", id, act: "plan", user: "fakeuser", arg: "500M" }))
  console.log("auto: disable:", await api({ action: "act", id, act: "disable", user: "fakeuser" }))
  console.log("auto: kick:", await api({ action: "act", id, act: "kick", user: "fakeuser" }))
  // Paid up: three months paid.
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "payments", since: 0, changes: [change({ id: "wdtest-cf-pay", clientId: CID, date: "2026-11-02", amount: 396 * 3, method: "efectivo", reference: "", notes: "", by: "Prueba", createdAt: now, updatedAt: now })] }) })
  await reset()
  console.log("auto, paid: suspend:", await api({ action: "act", id, act: "suspend", user: "fakeuser" }))
  let s = await svc()
  console.log("  Clientes:", JSON.stringify({ status: s.status, hold: s.hold, holdOpen: (s.holds ?? []).some((h) => !h.to) }))
  console.log("auto, held: reconnect:", await api({ action: "act", id, act: "reconnect", user: "fakeuser" }))
  s = await svc()
  console.log("  Clientes:", JSON.stringify({ status: s.status, hold: s.hold }))
  // Automatic off: staff decide (late again: the payment removed).
  await db.query(`delete from payment_versions where payment_id = 'wdtest-cf-pay'`).catch(() => {})
  await db.query(`delete from payments where id = 'wdtest-cf-pay'`)
  await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "update", id, auto: false }) })
  await reset()
  console.log("manual, late: reconnect:", await api({ action: "act", id, act: "reconnect", user: "fakeuser" }))
  await reset()
  console.log("manual, late: suspend:", await api({ action: "act", id, act: "suspend", user: "fakeuser" }))
  s = await svc()
  console.log("  Clientes (debt suspension, no hold):", JSON.stringify({ status: s.status, hold: s.hold }))
  const logged = (await db.query(`select status, result from router_actions where router_id = $1 order by id`, [id])).rows
  console.log("logged:", logged.map((l) => l.result || l.status).join(" "))
  await reset()
  await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id }) })
  const q = async (sql, a) => (await db.query(sql, a)).rowCount
  console.log("cleanup:", JSON.stringify({ versions: await q(`delete from client_versions where client_id = $1`, [CID]), client: await q(`delete from clients where id = $1`, [CID]) }))
  await db.end()
})().catch((e) => { console.error(e); process.exit(1) })
