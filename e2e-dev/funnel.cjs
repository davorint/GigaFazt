// Phase 6 in a phone-size browser on dev: three late clients (paid alone, paid after a notice, still owing), a
// reminder WhatsApp in the log; screenshot of the funnel; cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const ids = ["wdtest-p6-a", "wdtest-p6-b", "wdtest-p6-c"]
const payIds = ["wdtest-p6-pa", "wdtest-p6-pb"]

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const now = new Date().toISOString()
  const client = (id, name) => ({ id, kind: "residencial", name, phone: "5512345678", siteId: "", billingFrom: "2026-10", services: [{ id: `${id}-s`, type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-09-01", pppoeUser: id }], createdAt: now, updatedAt: now })
  const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: now })
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [change(client(ids[0], "Prueba Embudo Uno")), change(client(ids[1], "Prueba Embudo Dos")), change(client(ids[2], "Prueba Embudo Tres"))] }) })
  const pay = (id, clientId, date) => ({ id, clientId, date, amount: 396, method: "efectivo", reference: "", notes: "", by: "Prueba", createdAt: now, updatedAt: now })
  const r = await (await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "payments", since: 0, changes: [change(pay(payIds[0], ids[0], "2026-10-13")), change(pay(payIds[1], ids[1], "2026-10-20"))] }) })).json()
  console.log("payments:", JSON.stringify(r.results?.map((x) => x.outcome)))
  await db.query(`insert into whatsapp_sends (client_id, template, phone, status, sent_at, sent_by) values ($1, 'recordatorio', '525512345678', 'sent', '2026-10-12T17:00:00Z', 'Prueba')`, [ids[1]])
  const ev = await (await fetch(BASE + "/api/interno/embudo?desde=2026-06-01", { headers: H })).json()
  console.log("events for test clients:", JSON.stringify(ev.events?.filter((e) => ids.includes(e.clientId))))
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "es-MX" })
  await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
  await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/insights|Failed to load/.test(m.text()) && errors.push(m.text()))
  await page.goto(BASE + "/interno/software/wispdavor/cobranza")
  await page.getByText("Últimos 6 meses").waitFor({ timeout: 20000 })
  await page.waitForTimeout(3000)
  await page.getByLabel("Mes", { exact: true }).selectOption("2026-10")
  await page.getByText("Prueba Embudo Dos").waitFor({ timeout: 20000 })
  const text = await page.locator("main").innerText()
  console.log("rows:", ["Uno", "Dos", "Tres"].map((n) => (text.match(new RegExp(`Prueba Embudo ${n}\\n?([^\\n]*)`)) ?? [])[1]).join(" | "))
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  await page.screenshot({ path: path.join(SP, "p6-funnel.png"), fullPage: true })
  console.log("overflow:", over, "errors:", JSON.stringify(errors))
  await browser.close()
  const q = async (sql, a) => (await db.query(sql, a)).rowCount
  console.log("cleanup:", JSON.stringify({
    sends: await q(`delete from whatsapp_sends where client_id = any($1)`, [ids]),
    payVersions: await q(`delete from payment_versions where payment_id = any($1)`, [payIds]).catch(() => "n/a"),
    payments: await q(`delete from payments where id = any($1)`, [payIds]),
    versions: await q(`delete from client_versions where client_id = any($1)`, [ids]),
    clients: await q(`delete from clients where id = any($1)`, [ids]),
  }))
  await db.end()
})().catch((e) => { console.error(e); process.exit(1) })
