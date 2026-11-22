// Phase 13 (owner 2026-11-22): link capacity. A deployment with two links (1000/500 Mbps), a router there and an evening
// of traffic straight in traffic_5m; the API's busy hour, use and room; the page on a phone. Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const SITE = "wdtest-cap-site"
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: new Date().toISOString() })
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const now = new Date().toISOString()
  const carrier = (id, down, up) => ({ id, providerId: "", name: id, downMbps: down, upMbps: up, ip: "", account: "", monthly: null, notes: "" })
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "sites", since: 0, changes: [change({ id: SITE, name: "Torre Capacidad Prueba", address: "Av. Prueba 3", municipality: "Cuernavaca", rooms: [{ id: "r1", name: "Cuarto", carriers: [carrier("A", 500, 250), carrier("B", 500, 250)] }], createdAt: now, updatedAt: now })] }) })
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: Array.from({ length: 10 }, (_, i) => change({ id: `wdtest-cap-c${i}`, name: `Cap ${i}`, siteId: SITE, services: [{ id: `wdtest-cap-s${i}`, type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-10-01" }], createdAt: now, updatedAt: now })) }) })
  const router = (await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Router Capacidad", siteId: SITE, pppoe: true }) }))).router
  try {
    // Yesterday 21:00–22:00 Mexico City (03:00 UTC): 850 Mbps down, 100 up; the rest of the evening 300 / 30.
    const base = Date.parse(new Date(Date.now() - 864e5).toISOString().slice(0, 10) + "T00:00:00Z")
    const rows = []
    for (let m = 0; m < 6 * 60; m += 5) {
      const at = new Date(base + m * 60000)
      const busy = m >= 180 && m < 240
      rows.push([router.id, "cap.user", at, Math.round(((busy ? 850 : 300) * 1e6 * 300) / 8), Math.round(((busy ? 100 : 30) * 1e6 * 300) / 8)])
    }
    for (const r of rows) await db.query(`insert into traffic_5m (router_id, "user", bucket, down, up) values ($1, $2, $3, $4, $5)`, r)
    const api = await j(await fetch(BASE + "/api/interno/capacidad", { headers: H }))
    const s = api.sites.find((x) => x.siteId === SITE)
    console.log("api:", JSON.stringify({ speed: s.speed, busy: Math.round(s.busy.down), use: Math.round(s.use * 100), full: s.full, perClient: Math.round(s.perClient), roomFor: s.roomFor }))
    console.log("first:", api.sites[0].siteId === SITE)
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ ...devices["iPhone 13"] })
    await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
    await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
    const page = await ctx.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.goto(`${BASE}/interno/software/wispdavor/capacidad`)
    await page.getByText("Torre Capacidad Prueba").waitFor({ timeout: 20000 })
    console.log("meter:", await page.getByRole("meter").first().getAttribute("aria-valuenow"), "full hint:", await page.getByText(/van llenos/).count())
    await page.getByText(/A qué horas se llena/).first().click()
    console.log("chart:", await page.locator("svg").count() > 0)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    console.log("overflow:", overflow, "errors:", JSON.stringify(errors))
    await browser.close()
  } finally {
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id: router.id }) })
    await db.query(`delete from traffic_5m where router_id = $1`, [router.id])
    await db.query(`delete from client_versions where client_id like 'wdtest-cap-%'`)
    await db.query(`delete from clients where id like 'wdtest-cap-%'`)
    await db.query(`delete from site_versions where site_id = $1`, [SITE])
    console.log("cleanup:", (await db.query(`delete from sites where id = $1`, [SITE])).rowCount)
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
