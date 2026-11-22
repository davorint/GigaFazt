// Phase 9 (owner 2026-11-22): a fault reported from the portal (form, photo, repeat), staff move it to "resuelto"
// (the report-update hook runs; without WhatsApp keys nothing is sent), and the automatic notices' settings (off by
// default, saved, read back, put back). Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const CID = "wdtest-ss-client"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
const change = (data, baseVersion = null) => ({ id: data.id, baseVersion, data, deleted: false, editedAt: new Date().toISOString() })

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  const q = async (s, a) => (await db.query(s, a)).rowCount
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  // The portal allows 60 lookups an hour per address; repeated test runs from this machine add up (dev database only).
  await db.query(`delete from report_hits where ip_hash like 'p:%'`)
  const now = new Date().toISOString()
  const before = (await (await fetch(BASE + "/api/interno/whatsapp", { headers: H })).json()).notices
  const errors = []
  try {
    await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [change({ id: CID, kind: "residencial", name: "Prueba Autoservicio", whatsapp: "5512345671", building: "Torre Prueba", apartment: "301", siteId: "", billingFrom: "2026-11", services: [{ id: "wdtest-ss-s", type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-11-01", pppoeUser: "ss.user" }], createdAt: now, updatedAt: now })] }) })
    const link = await (await fetch(BASE + "/api/interno/portal", { method: "POST", headers: H, body: JSON.stringify({ clientId: CID }) })).json()
    fs.writeFileSync(path.join(SP, "ss.png"), PNG)
    // The portal form on a phone.
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ ...devices["iPhone 13"] })
    const page = await ctx.newPage()
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.goto(`${BASE}/mi-cuenta#${link.link.token}`)
    await page.getByRole("heading", { name: "Reportar una falla" }).waitFor({ timeout: 15000 })
    await page.getByLabel("¿Qué pasa?").selectOption("otro")
    await page.getByRole("button", { name: "Enviar reporte" }).click()
    console.log("empty other:", await page.getByText("Cuéntanos qué pasa.", { exact: true }).count())
    await page.getByLabel("¿Qué pasa?").selectOption("sin-servicio")
    await page.getByLabel(/Cuéntanos más/).fill("La luz LOS está en rojo desde la mañana")
    await page.getByLabel(/Foto/).setInputFiles(path.join(SP, "ss.png"))
    await page.getByRole("button", { name: "Enviar reporte" }).click()
    await page.getByText(/Recibimos tu reporte/).waitFor({ timeout: 15000 })
    await page.getByRole("button", { name: "Enviar reporte" }).click()
    await page.getByText(/Ya tienes un reporte abierto/).waitFor({ timeout: 15000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await page.screenshot({ path: path.join(SP, "selfservice-portal.png"), fullPage: true })
    await browser.close()
    const rep = (await db.query(`select id, data, version from reports where client_id = $1 order by created_at`, [CID])).rows
    console.log("reports:", rep.length, JSON.stringify({ category: rep[0].data.category, priority: rep[0].data.priority, address: rep[0].data.address, phone: rep[0].data.phone, by: rep[0].data.by, files: rep[0].data.field.files.length }))
    console.log("photo stored:", (await db.query(`select count(*)::int n from field_files where ref_kind = 'reporte' and ref_id = $1`, [rep[0].id])).rows[0].n)
    // Staff resolve it: the save goes through; without WhatsApp keys nothing is sent.
    const resolved = { ...rep[0].data, id: rep[0].id, status: "resuelto", resolvedAt: now, resolution: "Conector limpiado" }
    const s = await (await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "reports", since: 0, changes: [change(resolved, rep[0].version)] }) })).json()
    console.log("resolved:", s.results[0].outcome, "sends:", (await db.query(`select count(*)::int n from whatsapp_sends where client_id = $1`, [CID])).rows[0].n)
    // Settings.
    console.log("default off:", JSON.stringify(before && { reminders: before.reminders, reportUpdates: before.reportUpdates }))
    const saved = await (await fetch(BASE + "/api/interno/whatsapp", { method: "POST", headers: H, body: JSON.stringify({ action: "notices", notices: { reminders: true, reminderDay: 6, noticeDay: 4, reportUpdates: true } }) })).json()
    console.log("saved:", JSON.stringify(saved.notices))
    console.log("overflow:", overflow, "errors:", JSON.stringify(errors))
  } finally {
    await fetch(BASE + "/api/interno/whatsapp", { method: "POST", headers: H, body: JSON.stringify({ action: "notices", notices: before }) })
    console.log("cleanup:", JSON.stringify({
      files: await q(`delete from field_files where ref_kind = 'reporte' and ref_id in (select id from reports where client_id = $1)`, [CID]),
      repV: await q(`delete from report_versions where report_id in (select id from reports where client_id = $1)`, [CID]),
      reps: await q(`delete from reports where client_id = $1`, [CID]),
      links: await q(`delete from portal_links where client_id = $1`, [CID]),
      cliV: await q(`delete from client_versions where client_id = $1`, [CID]),
      cli: await q(`delete from clients where id = $1`, [CID]),
    }))
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
