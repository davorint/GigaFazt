// Despliegues as one sheet (owner 2026-11-28): a deployment with a tower, a room with a carrier, a client; the sheet on
// a phone and a desktop: every block there, "faltan N datos", a field edited in place (Enter saves, Esc cancels), an
// invalid number kept open, units per floor summing into the tower, the map point, inline remove, no overflow, no
// console errors. Screenshots in .screenshots/despliegues-*. Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium, devices } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const SITE = "wdtest-sheet-site"
const OUT = path.join(__dirname, "..", ".screenshots")
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: new Date().toISOString() })

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  fs.mkdirSync(OUT, { recursive: true })
  const now = new Date().toISOString()
  const site = {
    id: SITE, name: "Torre Hoja Prueba", address: "Av. Prueba 28", municipality: "Coyoacán", state: "Ciudad de México",
    towers: [{ id: "wdtest-sheet-t1", name: "Torre A", floors: 4, apartments: 16, roomId: "wdtest-sheet-r1", notes: "" }],
    rooms: [{ id: "wdtest-sheet-r1", name: "Cuarto principal", location: "Sótano 1", breaker: "", carriers: [{ id: "wdtest-sheet-k1", providerId: "", name: "Carrier Prueba", downMbps: 1000, upMbps: 1000, ip: "", account: "", monthly: null, notes: "" }], equipment: [{ id: "wdtest-sheet-e1", kind: "olt", model: "MA5608T", serial: "", ip: "", firmware: "", notes: "" }], ports: [] }],
    contacts: [{ id: "wdtest-sheet-c1", name: "Rosa", role: "Administradora", phone: "5512345678", email: "" }],
    rentMonthly: 2500, createdAt: now, updatedAt: now,
  }
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "sites", since: 0, changes: [change(site)] }) })
  await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [change({ id: "wdtest-sheet-cl1", name: "Hoja Uno", siteId: SITE, towerId: "wdtest-sheet-t1", apartment: "301", services: [{ id: "wdtest-sheet-s1", type: "internet", status: "activo", plan: "500M", monthly: 496, start: "2026-10-01" }], createdAt: now, updatedAt: now })] }) })
  const errors = []
  const stored = async () => (await db.query(`select data from sites where id = $1`, [SITE])).rows[0]?.data
  const waitStored = async (f) => { for (let i = 0; i < 40; i++) { const d = await stored(); if (d && f(d)) return d; await new Promise((r) => setTimeout(r, 500)) } return stored() }
  try {
    const browser = await chromium.launch()
    for (const [w, opts] of [["390", devices["iPhone 13"]], ["1440", { viewport: { width: 1440, height: 1000 } }]]) {
      const ctx = await browser.newContext(opts)
      await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
      await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
      const page = await ctx.newPage()
      page.on("pageerror", (e) => errors.push(e.message))
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
      await page.goto(`${BASE}/interno/admin/despliegues?d=${SITE}`)
      await page.locator("#torres").waitFor({ timeout: 30000 })
      const blocks = await page.evaluate(() => ["general", "torres", "cuartos", "acuerdo", "acceso", "clientes", "levantamiento", "sitio"].every((id) => document.getElementById(id)))
      const chip = await page.getByRole("button", { name: /Faltan \d+ datos/ }).textContent()
      console.log(`${w} blocks: ${blocks} chip: ${chip}`)
      // Anything wider than the screen (also when the page clips it, which scrollWidth doesn't show).
      const wide = await page.evaluate(() => [...document.querySelectorAll("body *")].filter((e) => e.getBoundingClientRect().right > Math.min(window.innerWidth, screen.width) + 1 && getComputedStyle(e).position !== "fixed" && !(() => { for (let a = e.parentElement; a; a = a.parentElement) if (["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(a).overflowX)) return true; return false })()).slice(0, 6).map((e) => [e.tagName, e.className.toString().slice(0, 60), Math.round(e.getBoundingClientRect().right), (e.textContent ?? "").slice(0, 30)]))
      console.log(`${w} wide: ${JSON.stringify(wide)} viewport: ${await page.evaluate(() => [window.innerWidth, screen.width].join("/"))}`)
      await page.screenshot({ path: path.join(OUT, `despliegues-sheet-${w}.png`), fullPage: true })
      if (w === "390") {
        // Edit a field in place: the breaker.
        await page.locator("#f-room\\.wdtest-sheet-r1\\.breaker button").click()
        await page.getByLabel("Interruptor (pastilla)").fill("30 A")
        await page.keyboard.press("Enter")
        const d1 = await waitStored((d) => d.rooms?.[0]?.breaker === "30 A")
        console.log(`${w} breaker saved: ${d1?.rooms?.[0]?.breaker}`)
        // Esc cancels.
        await page.locator("#f-name button").click()
        await page.getByLabel("Nombre", { exact: true }).fill("No se guarda")
        await page.keyboard.press("Escape")
        console.log(`${w} esc kept: ${await page.locator("#f-name").textContent()}`)
        // An invalid number stays open with its error, nothing saved.
        await page.locator("#f-agreement\\.rent button").click()
        await page.getByLabel(/Renta al edificio/).fill("abc")
        await page.keyboard.press("Enter")
        console.log(`${w} invalid kept open: ${await page.getByRole("alert").filter({ hasText: /número/ }).count()}`)
        await page.keyboard.press("Escape")
        // Units per floor sum into the tower.
        await page.getByText(/Departamentos por piso/).click()
        await page.getByRole("button", { name: /Piso 1 \(PB\)/ }).click()
        await page.getByLabel("Piso 1 (PB)").fill("2")
        await page.keyboard.press("Enter")
        await page.getByRole("button", { name: /^Piso 2/ }).click()
        await page.getByLabel("Piso 2", { exact: true }).fill("4")
        await page.keyboard.press("Enter")
        const d2 = await waitStored((d) => d.towers?.[0]?.apartments === 6)
        console.log(`${w} floors: ${JSON.stringify(d2?.towers?.[0]?.perFloor)} apartments: ${d2?.towers?.[0]?.apartments}`)
        // The map point, pasted as Google Maps copies it.
        await page.locator("#f-location button").click()
        await page.getByLabel("Ubicación en el mapa").fill("19.3612, -99.1641")
        await page.keyboard.press("Enter")
        const d3 = await waitStored((d) => d.lat === 19.3612)
        console.log(`${w} point: ${d3?.lat},${d3?.lng}`)
        // Remove asks on the page.
        await page.getByRole("button", { name: "Quitar contacto" }).click()
        await page.getByRole("alertdialog").getByRole("button", { name: "No", exact: true }).click()
        console.log(`${w} contact kept: ${await page.getByRole("button", { name: "Quitar contacto" }).count()}`)
        // The chip goes to a missing field.
        await page.getByRole("button", { name: /Faltan \d+ datos/ }).click()
        console.log(`${w} chip focus in a missing field: ${await page.evaluate(() => !!document.activeElement?.closest("[data-missing]"))}`)
        await page.screenshot({ path: path.join(OUT, `despliegues-sheet-${w}-edited.png`), fullPage: true })
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - Math.min(window.innerWidth, screen.width))
      console.log(`${w} overflow: ${overflow}`)
      await page.goto(`${BASE}/interno/admin/despliegues`)
      await page.getByText("Torre Hoja Prueba").first().waitFor({ timeout: 20000 })
      await page.screenshot({ path: path.join(OUT, `despliegues-list-${w}.png`), fullPage: false })
      await ctx.close()
    }
    await browser.close()
    console.log(`errors: ${JSON.stringify(errors)}`)
  } finally {
    await db.query(`delete from client_versions where client_id like 'wdtest-sheet-%'`)
    await db.query(`delete from clients where id like 'wdtest-sheet-%'`)
    await db.query(`delete from site_versions where site_id = $1`, [SITE])
    console.log("cleanup:", (await db.query(`delete from sites where id = $1`, [SITE])).rowCount)
    await db.end()
  }
})()
