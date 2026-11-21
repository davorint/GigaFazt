// Phase 4 end to end on dev: a router with 10 sessions, a sudden drop → outage (portal banner), recovery → closed;
// carriers all silent → carrier outage; ONT pings stored. Cleans up after itself.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba" }
const SITE = "wdtest-p4-site", CID = "wdtest-p4-client"
const users = Array.from({ length: 10 }, (_, i) => `p4u${i}`)
const report = (activeCount, gwReceived) =>
  [...users.map((u, i) => `s;${u};200M;false;${i < activeCount ? 1 : 0};0;0`), `g;10.9.9.1;5;${gwReceived};4ms`, "o;p4u0;2;2;3", "o;p4u1;2;1;80"].join("\n")

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const now = new Date().toISOString()
  const client = { id: CID, kind: "residencial", name: "Prueba Falla", phone: "", siteId: SITE, billingFrom: "2026-11", services: [{ id: "wdtest-p4-svc", type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-11-01", pppoeUser: "p4u0" }], createdAt: now, updatedAt: now }
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [{ id: CID, baseVersion: null, data: client, deleted: false, editedAt: now }] }) })
  const c = await (await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Prueba Falla", siteId: SITE, pppoe: true }) })).json()
  const rid = c.router.id
  fs.writeFileSync(path.join(SP, "wd-p4-rid.txt"), rid)
  const auth = "Bearer " + c.script.match(/Bearer ([^"]+)"/)[1]
  const post = (body) => fetch(BASE + "/api/routers/agente", { method: "POST", headers: { authorization: auth, "content-type": "text/plain" }, body }).then((r) => r.status)
  const open = async () => (await db.query(`select kind, baseline, low, ended_at from outages where router_id = $1 order by id`, [rid])).rows
  // History: 10 online in the buckets of the last half hour (the peak a drop is measured against).
  for (const m of [25, 20, 15, 10]) await db.query(`insert into router_metrics (router_id, bucket, online) values ($1, date_trunc('hour', now()) + floor(extract(minute from now() - interval '${m} minutes') / 5) * interval '5 minutes' - (case when now() - interval '${m} minutes' < date_trunc('hour', now()) then interval '1 hour' else interval '0' end), 10) on conflict do nothing`, [rid])
  console.log("drop to 3:", await post(report(3, 5)), JSON.stringify(await open()))
  const link = await (await fetch(BASE + "/api/interno/portal", { method: "POST", headers: H, body: JSON.stringify({ clientId: CID }) })).json()
  const view = await (await fetch(BASE + "/api/mi-cuenta", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: link.link.token }) })).json()
  console.log("portal outage:", JSON.stringify(view.view?.outage ?? null))
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ ...devices["Pixel 7"], locale: "es-MX" })).newPage()
  await page.goto(`${BASE}/mi-cuenta#${link.link.token}`)
  await page.getByText("Hola, Prueba").waitFor({ timeout: 10000 })
  console.log("banner shown:", await page.getByText("Hay una falla en la red de tu edificio").count())
  await page.screenshot({ path: path.join(SP, "p4-portal.png"), fullPage: true })
  console.log("recovered to 9:", await post(report(9, 5)), JSON.stringify(await open()))
  console.log("carriers silent:", await post(report(9, 0)), JSON.stringify((await open()).at(-1)))
  console.log("carrier back:", await post(report(9, 5)), JSON.stringify((await open()).at(-1)))
  const onts = (await db.query(`select "user", ont_rtt, ont_loss from router_users where router_id = $1 and ont_at is not null order by "user"`, [rid])).rows
  console.log("onts:", JSON.stringify(onts))
  const mon = await (await fetch(BASE + "/api/interno/monitoreo", { headers: H })).json()
  console.log("monitor:", JSON.stringify({ routers: mon.routers.filter((r) => r.id === rid).length, series: (mon.series[rid] ?? []).length, onts: mon.onts.filter((o) => o.routerId === rid).map((o) => o.user), outages: mon.outages.filter((o) => o.routerId === rid).length }))
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "es-MX" })
  await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("gigafazt-sync")) localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
  const p2 = await ctx.newPage()
  const errors = []
  p2.on("pageerror", (e) => errors.push(e.message))
  p2.on("console", (m) => m.type() === "error" && !/insights|Failed to load/.test(m.text()) && errors.push(m.text()))
  await p2.goto(BASE + "/interno/software/wispdavor/monitoreo")
  await p2.getByText("Fallas de los últimos 30 días").waitFor({ timeout: 15000 })
  const over = await p2.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await p2.screenshot({ path: path.join(SP, "p4-monitor-390.png"), fullPage: true })
  console.log("monitor page overflow:", over, "errors:", JSON.stringify(errors))
  await browser.close()
  // Clean up
  const q = async (sql, a) => (await db.query(sql, a)).rowCount
  console.log("cleanup:", JSON.stringify({
    outages: await q(`delete from outages where router_id = $1`, [rid]),
    metrics: await q(`delete from router_metrics where router_id = $1`, [rid]),
    users: await q(`delete from router_users where router_id = $1`, [rid]),
    actions: await q(`delete from router_actions where router_id = $1`, [rid]),
    router: await q(`delete from routers where id = $1`, [rid]),
    links: await q(`delete from portal_links where client_id = $1`, [CID]),
    versions: await q(`delete from client_versions where client_id = $1`, [CID]),
    client: await q(`delete from clients where id = $1`, [CID]),
  }))
  await db.end()
})().catch((e) => { console.error(e); process.exit(1) })
