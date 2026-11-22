// Phase 12 (owner 2026-11-22): a new client in one step, in the browser on a phone. Fills the form (with a mistake
// first), submits, and checks what was made: client + services, installation, PPPoE action on the deployment's router
// (password shown once), OLT commands, portal link. Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const SITE = "wdtest-alta-site"
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: new Date().toISOString() })
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  const q = async (s, a) => (await db.query(s, a)).rowCount
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const now = new Date().toISOString()
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "sites", since: 0, changes: [change({ id: SITE, name: "Torre Alta Prueba", address: "Av. Prueba 2", municipality: "Cuernavaca", createdAt: now, updatedAt: now })] }) })
  const router = (await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Router Alta Prueba", siteId: SITE, pppoe: true }) }))).router
  const errors = []
  let clientId = ""
  try {
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ ...devices["iPhone 13"] })
    await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
    await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
    const page = await ctx.newPage()
    page.on("pageerror", (e) => errors.push(e.message))
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    await page.goto(`${BASE}/interno/software/wispdavor/alta`)
    await page.getByLabel("Nombre del titular").waitFor({ timeout: 20000 })
    await page.getByRole("button", { name: "Dar de alta" }).click()
    console.log("empty:", await page.getByText(/^Revisa /).textContent())
    await page.getByLabel("Nombre del titular").fill("Prueba Alta Ñandú")
    await page.getByLabel("WhatsApp").fill("55 1234 5672")
    await page.getByLabel("Despliegue", { exact: true }).selectOption(SITE)
    await page.getByLabel("Departamento").fill("1204")
    await page.getByLabel("Departamento").blur()
    await page.getByText("500M").click()
    await page.getByLabel("Agregar TV").check()
    const d = new Date(Date.now() + 3 * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
    await page.getByLabel("Fecha", { exact: true }).fill(d)
    await page.getByLabel("Número de serie de la ONT (opcional)").fill("48575443abcd0099")
    await page.getByLabel("Puerto de la OLT (opcional)").fill("0/1/7")
    console.log("user:", await page.getByLabel("Usuario PPPoE", { exact: true }).inputValue(), "ont id:", await page.getByLabel("ONT ID", { exact: true }).inputValue())
    await page.waitForFunction(() => [...document.querySelectorAll("select option")].some((o) => o.textContent.includes("Router Alta Prueba")), null, { timeout: 15000 })
    console.log("router picked:", (await page.getByLabel("Router del despliegue (usuario PPPoE)").inputValue()) === router.id)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await page.getByRole("button", { name: "Dar de alta" }).click()
    await page.getByRole("heading", { name: "Listo" }).waitFor({ timeout: 30000 })
    const steps = await page.locator("li").allTextContents()
    console.log("steps:", JSON.stringify(steps.map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => /^[✓✗–]/.test(s)).map((s) => s.slice(0, 2) + s.slice(2).split(" ").slice(0, 3).join(" "))))
    console.log("password shown:", await page.getByText("Contraseña PPPoE (solo se muestra esta vez)").count(), "olt:", /ont add 7 0 sn-auth 48575443ABCD0099/.test(await page.locator("pre").first().textContent()))
    console.log("welcome link:", await page.getByRole("link", { name: "Mandar bienvenida por WhatsApp" }).count())
    await page.screenshot({ path: path.join(SP, "alta-done.png"), fullPage: true })
    await browser.close()
    const c = (await db.query(`select id, data from clients where data->>'name' = 'Prueba Alta Ñandú'`)).rows[0]
    clientId = c?.id ?? ""
    console.log("client:", JSON.stringify(c && c.data.services.map((s) => [s.type, s.plan, s.monthly, s.pppoeUser || "", s.oltPort || "", s.ontId])))
    console.log("appointment:", (await db.query(`select count(*)::int n from appointments where data->>'clientId' = $1 and data->>'kind' = 'instalacion'`, [clientId])).rows[0].n)
    console.log("router action:", JSON.stringify((await db.query(`select kind, "user", arg1, client_id = $2 as linked from router_actions where router_id = $1`, [router.id, clientId])).rows))
    console.log("portal link:", (await db.query(`select count(*)::int n from portal_links where client_id = $1`, [clientId])).rows[0].n)
    console.log("overflow:", overflow, "errors:", JSON.stringify(errors))
  } finally {
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id: router.id }) })
    console.log("cleanup:", JSON.stringify({
      appts: await q(`delete from appointments where data->>'clientId' = $1`, [clientId]),
      apptV: await q(`delete from appointment_versions where appointment_id not in (select id from appointments)`).catch(() => "n/a"),
      links: await q(`delete from portal_links where client_id = $1`, [clientId]),
      sends: await q(`delete from whatsapp_sends where client_id = $1`, [clientId]),
      cliV: await q(`delete from client_versions where client_id = $1`, [clientId]),
      cli: await q(`delete from clients where id = $1`, [clientId]),
      siteV: await q(`delete from site_versions where site_id = $1`, [SITE]),
      site: await q(`delete from sites where id = $1`, [SITE]),
    }))
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
