// Items 7 and 10 end to end on dev: Técnico photo offline → outbox → back online → uploaded and linked; portal plan
// change request (and a repeat), receipt PDF download. Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const AID = "wdtest-it-appt", CID = "wdtest-it-client", PID = "wdtest-it-pay"
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: new Date().toISOString() })

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
  const now = new Date().toISOString()
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "agenda", since: 0, changes: [change({ id: AID, kind: "instalacion", date: today, time: "11:00", who: "Prueba WD", status: "confirmada", name: "Cliente Sin Señal", phone: "", address: "Sótano 2", notes: "", createdAt: now, updatedAt: now })] }) })
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [change({ id: CID, kind: "residencial", name: "Prueba Portal Plan", phone: "5512345670", siteId: "", billingFrom: "2026-11", services: [{ id: "wdtest-it-s", type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-11-01", pppoeUser: "it.user" }], createdAt: now, updatedAt: now })] }) })
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "payments", since: 0, changes: [change({ id: PID, clientId: CID, date: "2026-11-03", amount: 396, method: "deposito", reference: "Depósito (OXXO) núm. 12", notes: "", by: "Prueba", createdAt: now, updatedAt: now })] }) })
  const link = await (await fetch(BASE + "/api/interno/portal", { method: "POST", headers: H, body: JSON.stringify({ clientId: CID }) })).json()

  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices["Pixel 7"], locale: "es-MX", acceptDownloads: true })
  await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
  await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
  const page = await ctx.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/insights|Failed to load|net::ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m.text()) && errors.push(m.text()))
  page.on("dialog", (d) => d.accept())

  // ── Item 7: Técnico offline ──
  await page.goto(BASE + "/interno/tecnico")
  await page.getByText("Cliente Sin Señal").waitFor({ timeout: 20000 })
  await page.getByText("Cliente Sin Señal").click()
  await ctx.setOffline(true)
  await page.locator('input[type="file"]').setInputFiles({ name: "sotano.png", mimeType: "image/png", buffer: PNG })
  await page.getByText(/espera señal en el teléfono/).waitFor({ timeout: 15000 })
  console.log("offline: banner:", await page.getByText(/esperan? señal en este teléfono/).count())
  await page.screenshot({ path: path.join(SP, "items-tecnico-offline.png"), fullPage: true })
  await ctx.setOffline(false)
  await page.evaluate(() => window.dispatchEvent(new Event("online")))
  await page.getByText(/Se subieron 1 pendientes/).waitFor({ timeout: 20000 })
  await page.getByRole("button", { name: "Sincronizar ahora" }).click().catch(() => {})
  await page.waitForTimeout(4000)
  const files = (await db.query(`select count(*)::int n from field_files where ref_id = $1`, [AID])).rows[0].n
  const linked = (await db.query(`select data->'field'->'files' f from appointments where id = $1`, [AID])).rows[0]?.f ?? []
  console.log("back online: stored files:", files, "linked to the job:", linked.length, "banner gone:", (await page.getByText(/esperan? señal en este teléfono/).count()) === 0)

  // ── Item 10: portal ──
  const portal = await ctx.newPage()
  portal.on("dialog", (d) => d.accept())
  portal.on("pageerror", (e) => errors.push(e.message))
  await portal.goto(`${BASE}/mi-cuenta#${link.link.token}`)
  await portal.getByText("Cambiar de plan").waitFor({ timeout: 15000 })
  console.log("current plan marked:", await portal.getByText("Tu plan actual").count())
  await portal.getByRole("button", { name: "Pedir este plan" }).first().click()
  await portal.getByText(/Recibimos tu solicitud/).waitFor({ timeout: 15000 })
  await portal.getByRole("button", { name: "Pedir este plan" }).last().click()
  await portal.getByText(/Ya tienes una solicitud abierta/).waitFor({ timeout: 15000 })
  const reps = (await db.query(`select data->>'description' d from reports where client_id = $1`, [CID])).rows
  console.log("reports:", JSON.stringify(reps.map((r) => r.d)))
  await portal.getByRole("button", { name: "Comprobante" }).first().click()
  const [download] = await Promise.all([portal.waitForEvent("download"), portal.getByRole("button", { name: "Descargar PDF" }).click()])
  const file = path.join(SP, "items-receipt.pdf")
  await download.saveAs(file)
  const pdf = fs.readFileSync(file)
  console.log("pdf:", download.suggestedFilename(), pdf.slice(0, 8).toString("latin1"), pdf.length, "bytes; accents:", pdf.includes(Buffer.from("Dep\xf3sito", "latin1")))
  await portal.screenshot({ path: path.join(SP, "items-portal.png"), fullPage: true })
  console.log("errors:", JSON.stringify(errors))
  await browser.close()

  const q = async (sql, a) => (await db.query(sql, a)).rowCount
  console.log("cleanup:", JSON.stringify({
    files: await q(`delete from field_files where ref_id = $1`, [AID]),
    apptV: await q(`delete from appointment_versions where appointment_id = $1`, [AID]).catch(() => "n/a"),
    appt: await q(`delete from appointments where id = $1`, [AID]),
    repV: await q(`delete from report_versions where report_id in (select id from reports where client_id = $1)`, [CID]),
    reps: await q(`delete from reports where client_id = $1`, [CID]),
    payV: await q(`delete from payment_versions where payment_id = $1`, [PID]).catch(() => "n/a"),
    pay: await q(`delete from payments where id = $1`, [PID]),
    links: await q(`delete from portal_links where client_id = $1`, [CID]),
    cliV: await q(`delete from client_versions where client_id = $1`, [CID]),
    cli: await q(`delete from clients where id = $1`, [CID]),
  }))
  await db.end()
})().catch((e) => { console.error(e); process.exit(1) })
