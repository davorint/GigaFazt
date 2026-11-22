// Phase 15 (owner 2026-11-22): the client contract. An admin saves a test text; a client signs it on their phone (name,
// drawn signature, accept); the signed copy in Legal → Contratos (PDF + signature); a repeat says already signed; a
// stale version is refused. Puts the previous text back (or none); cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const CID = "wdtest-ct-client"
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: new Date().toISOString() })

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  // The portal allows 60 lookups an hour per address; repeated test runs from this machine add up (dev database only).
  await db.query(`delete from report_hits where ip_hash like 'p:%'`)
  const before = (await db.query(`select value from wisp_settings where key = 'contrato_cliente'`)).rows[0]
  const now = new Date().toISOString()
  const errors = []
  try {
    await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [change({ id: CID, name: "Prueba Contrato", whatsapp: "5512345673", building: "Torre Firma", apartment: "302", siteId: "", services: [{ id: "wdtest-ct-s", type: "internet", status: "activo", plan: "500M", monthly: 496, start: "2026-11-01" }], createdAt: now, updatedAt: now })] }) })
    const link = await (await fetch(BASE + "/api/interno/portal", { method: "POST", headers: H, body: JSON.stringify({ clientId: CID }) })).json()
    const token = link.link.token
    const none = await (await fetch(BASE + "/api/mi-cuenta/contrato", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })).json()
    console.log("before a text:", before ? "had one" : JSON.stringify(none.contract))
    const saved = await (await fetch(BASE + "/api/interno/contrato", { method: "POST", headers: H, body: JSON.stringify({ title: "Contrato de prueba", body: "TEXTO DE PRUEBA, NO ES UN CONTRATO REAL.\nCliente: {{nombre}}, {{direccion}}. Plan {{plan}} por {{precio}}.\n" + "Cláusula de prueba. ".repeat(300) }) })).json()
    const v = saved.template.version
    console.log("saved version > 0:", v > 0)
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ ...devices["iPhone 13"] })
    const page = await ctx.newPage()
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.goto(`${BASE}/mi-cuenta#${token}`)
    await page.getByRole("heading", { name: "Tu contrato" }).waitFor({ timeout: 20000 })
    console.log("filled:", await page.getByText(/Cliente: Prueba Contrato, Torre Firma, Depto\. 302\. Plan 500M por \$496\.00/).count())
    await page.getByRole("button", { name: "Firmar contrato" }).click()
    console.log("incomplete:", await page.getByText("Escribe tu nombre completo, dibuja tu firma y marca la casilla.").count())
    await page.getByLabel("Tu nombre completo").fill("Prueba Contrato Firmante")
    const canvas = page.locator("canvas").first()
    await canvas.scrollIntoViewIfNeeded()
    const box = await canvas.boundingBox()
    await page.mouse.move(box.x + 20, box.y + 40)
    await page.mouse.down()
    for (let i = 0; i < 12; i++) await page.mouse.move(box.x + 30 + i * 15, box.y + 30 + (i % 2) * 30, { steps: 3 })
    await page.mouse.up()
    // The public site's smooth scrolling (Lenis) keeps the page gliding after Playwright scrolls, so its click can land
    // on whatever passes underneath: centered, then clicked in place (a person's tap isn't affected).
    const accept = page.getByLabel(/Leí el contrato completo/)
    await accept.evaluate((e) => e.scrollIntoView({ block: "center" }))
    await accept.check({ force: true })
    const signBtn = page.getByRole("button", { name: "Firmar contrato" })
    await signBtn.evaluate((e) => e.scrollIntoView({ block: "center" }))
    await signBtn.click({ force: true })
    await page.getByText(/Firmaste tu contrato el/).waitFor({ timeout: 20000 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await browser.close()
    const c = (await db.query(`select id, data from contracts where kind = 'cliente' and data->>'clientId' = $1`, [CID])).rows
    console.log("contract:", c.length, JSON.stringify({ number: c[0].data.number === `PORTAL-v${v}`, party: c[0].data.party, files: c[0].data.files.map((f) => f.mime) }))
    const pdf = (await db.query(`select bytes, blob_path from contract_files where contract_id = $1 and mime = 'application/pdf'`, [c[0].id])).rows[0]
    console.log("pdf:", pdf.bytes ? pdf.bytes.subarray(0, 8).toString("latin1") : `blob ${!!pdf.blob_path}`)
    const form = new FormData()
    form.set("token", token)
    form.set("version", String(v - 1))
    form.set("nombre", "Otra Persona")
    form.set("firma", new Blob([Buffer.alloc(400)], { type: "image/png" }), "f.png")
    console.log("stale or bad:", (await fetch(BASE + "/api/mi-cuenta/contrato", { method: "POST", body: form })).status)
    const again = await (await fetch(BASE + "/api/mi-cuenta/contrato", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) })).json()
    console.log("signed shown:", !!again.contract.signed)
    console.log("overflow:", overflow, "errors:", JSON.stringify(errors))
  } finally {
    if (before) await db.query(`update wisp_settings set value = $1 where key = 'contrato_cliente'`, [before.value])
    else await db.query(`delete from wisp_settings where key = 'contrato_cliente'`)
    const ids = (await db.query(`select id from contracts where data->>'clientId' = $1`, [CID])).rows.map((r) => r.id)
    await db.query(`delete from contract_files where contract_id = any($1)`, [ids])
    await db.query(`delete from contract_versions where contract_id = any($1)`, [ids])
    await db.query(`delete from contracts where id = any($1)`, [ids])
    await db.query(`delete from portal_links where client_id = $1`, [CID])
    await db.query(`delete from client_versions where client_id = $1`, [CID])
    console.log("cleanup:", (await db.query(`delete from clients where id = $1`, [CID])).rowCount)
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
