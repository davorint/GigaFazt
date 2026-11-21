// Both connection modes end to end against the fake router (REST 18443, API-SSL 18729): pinned certificate, read-only
// refused on the site and by the router, write user works when allowed, Clientes follows, backups; the toggle in a
// phone-size browser. Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const fp = fs.readFileSync(path.join(SP, "fakeros", "fp.txt"), "utf8").trim()
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const CID = "wdtest-both-client"
const api = async (body) => {
  const r = await fetch(BASE + "/api/interno/routers/rest", { method: "POST", headers: H, body: JSON.stringify(body) })
  return [r.status, await r.json()]
}
const short = ([s, b]) => `${s} ${b.error ?? (b.done ?? b.ok)}`

const fakeState = () =>
  new Promise((resolve) => {
    const https = require("node:https")
    const r = https.request({ host: "127.0.0.1", port: 18443, method: "GET", path: "/rest/_state", ca: fs.readFileSync(path.join(SP, "fakeros", "cert.pem")), servername: "fake-router", checkServerIdentity: () => undefined, headers: { authorization: "Basic " + Buffer.from("lectura:pass-lectura").toString("base64") } }, (res) => {
      let b = ""
      res.on("data", (c) => (b += c))
      res.on("end", () => resolve(JSON.parse(b)))
    })
    r.on("error", () => resolve({ log: [] }))
    r.end()
  })
;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const now = new Date().toISOString()
  const client = { id: CID, kind: "residencial", name: "Prueba Modos", phone: "", siteId: "", billingFrom: "2026-11", services: [{ id: "wdtest-both-svc", type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-11-01", pppoeUser: "fakeuser" }], createdAt: now, updatedAt: now }
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [{ id: CID, baseVersion: null, data: client, deleted: false, editedAt: now }] }) })
  const c = await (await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Prueba Modos", siteId: "", pppoe: true }) })).json()
  const id = c.router.id
  await api({ action: "save", id, host: "127.0.0.1", port: 18443, apiPort: 18729, readUser: "lectura", readPass: "pass-lectura", fingerprint: fp })
  for (const mode of ["rest", "api"]) {
    // A fresh session on the fake router each round.
    await fetch(BASE + "/api/interno/routers/rest", { method: "POST", headers: H, body: JSON.stringify({ action: "save", id, protocol: mode, readOnly: true, clearWrite: true }) })
    await db.query("select 1")
    console.log(`\n== ${mode} ==`)
    console.log("test:", JSON.stringify((await api({ action: "test", id }))[1]))
    const before = (await fakeState()).log.filter((l) => l === "API connect").length
    const live = (await api({ action: "live", id }))[1].live
    console.log("API connections for the live view:", (await fakeState()).log.filter((l) => l === "API connect").length - before)
    console.log("live:", JSON.stringify({ via: live.protocol, board: live.resource.board, ifs: live.interfaces.map((i) => [i.name, i.rx]), sessions: live.sessions.length, log: live.log[0]?.message }))
    const cl = (await api({ action: "client", id, user: "fakeuser" }))[1].client
    console.log("client:", JSON.stringify({ profile: cl.secret?.profile, ip: cl.session?.address, rate: cl.rate }))
    console.log("act read-only:", short(await api({ action: "act", id, act: "suspend", user: "fakeuser" })))
    await api({ action: "save", id, readOnly: false })
    console.log("act no write user:", short(await api({ action: "act", id, act: "suspend", user: "fakeuser" })))
    // The router itself refuses a write with the read-only user (as if the site were wrong).
    await api({ action: "save", id, writeUser: "lectura2", writePass: "pass-lectura" })
    console.log("act wrong write user:", short(await api({ action: "act", id, act: "suspend", user: "fakeuser" })))
    await api({ action: "save", id, writeUser: "escritura", writePass: "pass-escritura" })
    console.log("act suspend:", short(await api({ action: "act", id, act: "suspend", user: "fakeuser" })))
    console.log("Clientes:", (await db.query(`select data from clients where id = $1`, [CID])).rows[0].data.services[0].status)
    console.log("act reconnect:", short(await api({ action: "act", id, act: "reconnect", user: "fakeuser" })))
    console.log("act disable/enable:", short(await api({ action: "act", id, act: "disable", user: "fakeuser" })), "/", short(await api({ action: "act", id, act: "enable", user: "fakeuser" })))
    console.log("backup:", JSON.stringify((await api({ action: "backup", id }))[1]))
    // Put the fake session back for the next round.
    await new Promise((resolve) => {
      const https = require("node:https")
      const r = https.request({ host: "127.0.0.1", port: 18443, method: "POST", path: "/rest/_reset", ca: fs.readFileSync(path.join(SP, "fakeros", "cert.pem")), servername: "fake-router", checkServerIdentity: () => undefined, headers: { authorization: "Basic " + Buffer.from("escritura:pass-escritura").toString("base64"), "content-type": "application/json" } }, (res) => { res.resume(); res.on("end", resolve) })
      r.on("error", resolve)
      r.end("{}")
    })
  }
  const acts = (await db.query(`select kind, source, status, result from router_actions where router_id = $1 order by id`, [id])).rows
  console.log("\nlogged:", acts.map((a) => `${a.source}:${a.kind}:${a.status}${a.result ? `(${a.result})` : ""}`).join(" "))
  await api({ action: "save", id, protocol: "api", readOnly: true })
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "es-MX" })
  await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
  await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/insights|Failed to load/.test(m.text()) && errors.push(m.text()))
  await page.goto(BASE + "/interno/software/wispdavor/routers")
  await page.getByText("Conexión al router (REST o API)").first().click()
  await page.locator('[role="radio"][aria-checked="true"]:not([disabled])').first().waitFor({ timeout: 15000 })
  console.log("toggle shows API selected:", await page.getByRole("radio", { name: "API de MikroTik" }).getAttribute("aria-checked"))
  await page.getByRole("radio", { name: "API REST" }).click()
  await page.waitForTimeout(1500)
  console.log("after click, saved protocol:", (await db.query(`select protocol from router_rest where router_id = $1`, [id])).rows[0].protocol)
  await page.screenshot({ path: path.join(SP, "both-panel.png"), fullPage: true })
  const probar = page.getByRole("button", { name: "Probar conexión" })
  console.log("probar enabled when saved:", await probar.isEnabled())
  await page.getByLabel("Dirección (nombre DDNS o IP)").fill("otro.dynu.net")
  console.log("probar disabled when unsaved:", await probar.isDisabled(), "note:", await page.getByText("Hay cambios sin guardar").count())
  await page.goto(BASE + "/interno/software/wispdavor/envivo")
  await page.getByLabel("Router", { exact: true }).selectOption(id)
  await page.getByText("CCR2004-FAKE", { exact: false }).waitFor({ timeout: 20000 })
  console.log("live page says REST:", await page.getByText(/^Por API REST ·/).count())
  await page.getByLabel("Cada 15 s").check()
  await page.waitForTimeout(16500)
  console.log("after a timer refresh, view still there:", await page.getByText("CCR2004-FAKE", { exact: false }).count() > 0)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  console.log("overflow:", over, "errors:", JSON.stringify(errors))
  await browser.close()
  await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id }) })
  const q = async (sql, a) => (await db.query(sql, a)).rowCount
  console.log("cleanup:", JSON.stringify({ restRows: (await db.query(`select count(*) from router_rest where router_id = $1`, [id])).rows[0].count, versions: await q(`delete from client_versions where client_id = $1`, [CID]), client: await q(`delete from clients where id = $1`, [CID]) }))
  await db.end()
})().catch((e) => { console.error(e); process.exit(1) })
