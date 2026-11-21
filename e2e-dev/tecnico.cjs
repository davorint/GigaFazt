// Phase 5 in a phone-size browser on dev: today's appointment for "Prueba WD" → Llegué, a photo, a signature,
// Terminar; checks the record in the database and cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const AID = "wdtest-p5-appt"
// A tiny valid PNG (1x1).
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
  const now = new Date().toISOString()
  const appt = { id: AID, kind: "instalacion", date: today, time: "10:00", who: "Prueba WD", status: "confirmada", name: "Cliente Prueba", phone: "5512345678", address: "Av. Siempre Viva 742, Cuernavaca", notes: "Depto 3B", createdAt: now, updatedAt: now }
  const s = await (await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "agenda", since: 0, changes: [{ id: AID, baseVersion: null, data: appt, deleted: false, editedAt: now }] }) })).json()
  console.log("appointment:", JSON.stringify(s.results ?? s))
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "es-MX", permissions: [] })
  await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
  await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/insights|Failed to load|geolocation/i.test(m.text()) && errors.push(m.text()))
  await page.goto(BASE + "/interno/tecnico")
  await page.getByText("Cliente Prueba").waitFor({ timeout: 20000 })
  await page.screenshot({ path: path.join(SP, "p5-list.png"), fullPage: true })
  await page.getByText("Cliente Prueba").click()
  await page.getByRole("button", { name: "Llegué" }).click()
  await page.getByText(/en sitio desde/).waitFor({ timeout: 15000 })
  await page.locator('input[type="file"]').setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG })
  await page.getByText(/foto guardada/).waitFor({ timeout: 20000 })
  await page.getByLabel("Nombre de quien firma").fill("Cliente Prueba")
  const pad = page.getByRole("img", { name: "Firma aquí con el dedo" })
  const box = await pad.boundingBox()
  await page.mouse.move(box.x + 30, box.y + 80)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 20, box.y + 80 + Math.sin(i) * 30)
  await page.mouse.up()
  await page.getByRole("button", { name: "Guardar firma" }).click()
  await page.getByText("Firmó Cliente Prueba.").waitFor({ timeout: 20000 })
  await page.getByLabel("Qué se hizo").fill("ONT instalada y probada")
  await page.screenshot({ path: path.join(SP, "p5-job.png"), fullPage: true })
  await page.getByRole("button", { name: "Terminar" }).click()
  await page.getByText(/terminado \d/).waitFor({ timeout: 15000 })
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  // Let the phone sync, then read the record on the server.
  await page.getByRole("button", { name: "Sincronizar ahora" }).click().catch(() => {})
  await page.waitForTimeout(4000)
  const row = (await db.query(`select data from appointments where id = $1`, [AID])).rows[0]
  const f = row?.data?.field
  console.log("server record:", JSON.stringify({ status: row?.data?.status, arrived: !!f?.arrivedAt, done: !!f?.doneAt, files: f?.files?.map((x) => x.kind), signedBy: f?.signedBy, notes: f?.notes }))
  const files = (await db.query(`select kind, mime, size from field_files where ref_id = $1 order by uploaded_at`, [AID])).rows
  console.log("stored files:", JSON.stringify(files))
  console.log("overflow:", over, "errors:", JSON.stringify(errors))
  await browser.close()
  const q = async (sql, a) => (await db.query(sql, a)).rowCount
  console.log("cleanup:", JSON.stringify({ files: await q(`delete from field_files where ref_id = $1`, [AID]), versions: await q(`delete from appointment_versions where appointment_id = $1`, [AID]).catch(() => "n/a"), appt: await q(`delete from appointments where id = $1`, [AID]) }))
  await db.end()
})().catch((e) => { console.error(e); process.exit(1) })
