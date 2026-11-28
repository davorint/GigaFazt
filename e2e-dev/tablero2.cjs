// Tablero 2 (owner 2026-11-22: the Tablero drawn with D3). Seeds a deployment with link speeds and costs, clients on
// several plans (some cancelled, one price raised), payments and a week of traffic; opens the page on a phone and a
// desktop; checks every chart drew (rings, Sankey, waterfall, cohorts, clock…), no sideways scroll, no console errors,
// hovering shows a tooltip; then the simulated data. Saves screenshots (SHOTS). Cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const cookie = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const H = { cookie: `gf_interno=${cookie}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const SITE = "wdtest-t2-site"
const SHOTS = process.env.SHOTS || SP
const change = (data) => ({ id: data.id, baseVersion: null, data, deleted: false, editedAt: new Date().toISOString() })
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const sync = (kind, items) => fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind, since: 0, changes: items.map(change) }) })

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const now = new Date().toISOString()
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" })
  const plus = (d) => new Date(Date.parse(`${today}T12:00:00Z`) + d * 864e5).toISOString().slice(0, 10)
  const month = (back) => { const d = new Date(`${today.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 7) }
  const carrier = (id, down, up, monthly) => ({ id, providerId: "", name: id, downMbps: down, upMbps: up, ip: "", account: "", monthly, notes: "" })
  await sync("sites", [{ id: SITE, name: "Torre Tablero2 Prueba", address: "Av. Prueba 4", municipality: "Cuernavaca", lat: 18.92, lng: -99.23, rentMonthly: 1500, rooms: [{ id: "r1", name: "Cuarto", carriers: [carrier("A", 500, 500, 3000), carrier("B", 300, 300, 1800)] }], towers: [{ id: "t1", name: "A", apartments: 60 }], createdAt: now, updatedAt: now }])
  const plans = [["200M", 396], ["500M", 496], ["1G", 596]]
  const clients = Array.from({ length: 18 }, (_, i) => {
    const [plan, price] = plans[i % 3]
    const startBack = 1 + (i % 9)
    const cancelled = i % 7 === 6
    return {
      id: `wdtest-t2-c${i}`, name: `Tablero ${i}`, siteId: SITE, billingFrom: "", createdAt: now, updatedAt: now,
      services: [
        { id: `wdtest-t2-s${i}`, type: "internet", status: cancelled ? "cancelado" : "activo", plan, monthly: price, start: `${month(startBack)}-05`, cancelledAt: cancelled ? `${month(1)}-20` : "", cancelReason: cancelled ? ["precio", "mudanza", "fallas"][i % 3] : "", rxDbm: -16 - (i % 13) * 0.9, rxDate: today, rxHistory: [], priceHistory: i === 2 ? [{ until: month(2), monthly: 496 }] : [] },
        ...(i % 4 === 0 ? [{ id: `wdtest-t2-tv${i}`, type: "iptv", status: "activo", plan: "TV", monthly: 250, start: `${month(startBack)}-05` }] : []),
      ],
    }
  })
  await sync("clients", clients)
  const pays = []
  for (const c of clients) for (let b = 0; b < 3; b++) if ((c.id.length + b) % 4) pays.push({ id: `wdtest-t2-p${c.id.slice(-3)}${b}`, clientId: c.id, date: `${month(b)}-0${3 + b}`, amount: c.services[0].monthly, method: "transferencia", reference: "", notes: "", by: "Prueba", createdAt: now, updatedAt: now })
  await sync("payments", pays)
  const reps = [2, 30, 90, 200].map((h, i) => ({ id: `wdtest-t2-r${i}`, source: "interno", createdAt: new Date(Date.now() - h * 3600000).toISOString(), clientId: clients[i].id, name: clients[i].name, phone: "", address: "", siteId: SITE, category: "lento", description: "Prueba", priority: "normal", status: "nuevo", assignee: "", visitDate: "", cause: "", resolution: "", resolvedAt: "", notes: [], consentAt: "", by: "Prueba", updatedAt: now }))
  await sync("reports", reps)
  await sync("agenda", [1, 1, 3, 6, 9].map((d, i) => ({ id: `wdtest-t2-a${i}`, kind: "instalacion", date: plus(d), time: "10:00", who: "", status: "pendiente", clientId: "", leadId: "", reportId: "", siteId: SITE, name: `Instalación ${i}`, phone: "", address: "", notes: "", by: "Prueba", createdAt: now, updatedAt: now })))
  const router = (await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Router Tablero2", siteId: SITE, pppoe: true }) }))).router
  const errors = []
  try {
    // A week of traffic: evenings busiest (Mexico City 20–23 h = 02–05 UTC), weekends a bit more.
    // All rows in one statement (one by one took minutes against the remote database).
    const start = Date.now() - 7 * 864e5
    const tAt = [], tDown = [], tUp = []
    for (let m = 0; m < 7 * 24 * 60; m += 5) {
      const at = new Date(start + m * 60000)
      const hMx = (at.getUTCHours() + 18) % 24
      const wk = [0, 6].includes(at.getUTCDay()) ? 1.15 : 1
      const mbps = (hMx >= 19 && hMx <= 23 ? 520 : hMx >= 8 && hMx <= 18 ? 240 : 60) * wk
      tAt.push(at.toISOString())
      tDown.push(Math.round((mbps * 1e6 * 300) / 8))
      tUp.push(Math.round((mbps * 0.12 * 1e6 * 300) / 8))
    }
    await db.query(`insert into traffic_5m (router_id, "user", bucket, down, up) select $1, 't2.user', b, d, u from unnest($2::timestamptz[], $3::bigint[], $4::bigint[]) as x(b, d, u) on conflict do nothing`, [router.id, tAt, tDown, tUp])
    const api = await j(await fetch(BASE + "/api/interno/tablero", { headers: H }))
    console.log("api:", JSON.stringify({ traffic: api.network.hasTraffic, site: api.network.sites.some((s) => s.name === "Torre Tablero2 Prueba" && s.use > 0.5) }))
    // Two days of carrier gateway pings every 10 minutes (a few lost), and a 30-minute carrier outage two hours ago.
    const mAt = [], mGw = []
    for (let m = 0; m < 2 * 24 * 60; m += 10) {
      const lost = m % 170 === 0 ? 1 : 0
      mAt.push(new Date(Date.now() - m * 60000).toISOString())
      mGw.push(JSON.stringify([{ ip: "10.77.1.1", sent: 5, received: 5 - lost, rtt: 4 + (m % 60) / 20 }]))
    }
    await db.query(`insert into router_metrics (router_id, bucket, online, gateways) select $1, b, 12, g::jsonb from unnest($2::timestamptz[], $3::text[]) as x(b, g) on conflict do nothing`, [router.id, mAt, mGw])
    await db.query(`insert into outages (router_id, site_id, kind, started_at, ended_at) values ($1, $2, 'carrier', now() - interval '2 hours', now() - interval '90 minutes')`, [router.id, SITE])
    const api2 = await j(await fetch(BASE + "/api/interno/tablero2", { headers: H }))
    const mine = (xs) => (xs ?? []).filter((x) => x.routerId === router.id)
    console.log("api2:", JSON.stringify({ gateway: mine(api2.carriers?.gateways).some((g) => g.ip === "10.77.1.1" && g.hours.length >= 40 && g.hours.some((h) => h.loss > 0) && g.hours.every((h) => h.rtt !== null)), outages: mine(api2.carriers?.continuity)[0]?.outages.length, path: mine(api2.carriers?.path)[0]?.gatewayRtt > 0, daily: (api2.carriers?.daily ?? []).some((d) => d.siteId === SITE && d.days.length >= 1), traffic: (api2.carriers?.traffic ?? []).some((x) => x.siteId === SITE && x.hours.length >= 100 && x.hours.some((h) => h.down > 100)) }))
    const api3 = await j(await fetch(BASE + "/api/interno/tablero2/vivo", { headers: H }))
    const lr = (api3.live?.routers ?? []).find((r) => r.id === router.id)
    console.log("api3:", JSON.stringify({ router: !!lr && lr.siteId === SITE, gateway: !!lr && lr.gateways.some((g) => g.ip === "10.77.1.1" && g.rtt !== null), online: lr?.online === 12 }))
    const browser = await chromium.launch()
    for (const [w, h] of [[390, 844], [1440, 900]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 })
      await ctx.addCookies([{ name: "gf_interno", value: cookie, domain: "localhost", path: "/" }])
      await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba WD" })) } catch {} })
      const page = await ctx.newPage()
      page.on("pageerror", (e) => errors.push(`${w}: ${e.message}`))
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource|tiles|maplibre|webgl/i.test(m.text()) && errors.push(`${w}: ${m.text().slice(0, 200)}`))
      await page.goto(`${BASE}/interno/admin/tablero2`)
      await page.getByRole("heading", { name: "Dinero", exact: true }).waitFor({ timeout: 30000 })
      // The records arrive with the first sync: wait until the clients show, then for the charts.
      await page.waitForFunction(() => !document.body.innerText.includes("Todavía no hay servicios activos con precio."), null, { timeout: 60000 })
      await page.waitForFunction(() => document.querySelectorAll('svg[role="img"]').length >= 12, null, { timeout: 30000 }).catch(() => undefined)
      await page.waitForTimeout(1800)
      const charts = await page.evaluate(() => document.querySelectorAll('svg[role="img"]').length)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      const tables = await page.getByText("Ver tabla", { exact: true }).count()
      const parts = await page.evaluate(() => ({ dots: document.querySelector('svg[aria-label="La red viva"]')?.querySelectorAll("circle").length ?? 0, flows: document.querySelector('svg[aria-label="Cómo fluye el dinero cada mes"]')?.querySelectorAll("path").length ?? 0, clock: document.querySelector('svg[aria-label="El reloj de la red"]')?.querySelectorAll("path").length ?? 0 }))
      console.log(`${w}: charts ${charts >= 12} tables ${tables >= 8} overflow ${overflow} parts ${parts.dots >= 15 && parts.flows >= 4 && parts.clock === 168}`)
      // Hover a sector of the clock: a tooltip with the hour.
      const cell = page.locator('svg[aria-label="El reloj de la red"] path').nth(3 * 24 + 21)
      await cell.scrollIntoViewIfNeeded()
      await cell.hover({ force: true })
      console.log(`${w}: tooltip ${await page.getByText(/jue · 21:00–22:00/).count()}`)
      if (w < 500) {
        // A phone: tapping a step of the bridge shows its tooltip, and it stays after the finger lifts.
        await page.mouse.move(0, 0)
        const bar = page.locator('svg[aria-label="Puente del ingreso recurrente"] g').filter({ hasText: "Altas" }).first()
        await bar.scrollIntoViewIfNeeded()
        await bar.tap({ force: true })
        await page.waitForTimeout(300)
        console.log(`${w}: tap tooltip ${await page.locator('[role="presentation"]').filter({ hasText: /clientes?/ }).count()}`)
      }
      await page.screenshot({ path: path.join(SHOTS, `tablero2-${w}.png`), fullPage: true })
      // Simulated data: the switch, the banner, a tag on every card, and still no sideways scroll.
      await page.getByRole("switch", { name: "Datos simulados" }).click()
      await page.getByText(/Estás viendo datos inventados/).waitFor({ timeout: 15000 })
      await page.waitForTimeout(1500)
      const tags = await page.getByText("SIMULACIÓN", { exact: true }).count()
      const demoOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      // When something sticks out, say what (a failing check that names its element is quicker to fix).
      if (demoOverflow > 0) console.log(`${w} wide:`, JSON.stringify(await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 2).slice(-6).map((el) => `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").slice(0, 50)} @${el.closest("svg[aria-label]")?.getAttribute("aria-label") ?? ""} r=${Math.round(el.getBoundingClientRect().right)}`))))
      console.log(`${w} demo: switch ${await page.getByRole("switch", { name: "Datos simulados" }).getAttribute("aria-checked")} tags ${tags >= 12} overflow ${demoOverflow}`)
      // The second round draws with the simulated operator: streams, flows, galaxy, lit windows, light dots, repair bars.
      const more = await page.evaluate(() => {
        const n = (l, sel) => document.querySelector(`svg[aria-label="${l}"]`)?.querySelectorAll(sel).length ?? 0
        return { streams: n("El río del ingreso", "path") >= 3, flows: n("Cómo se mueven los clientes", "path") >= 5, galaxy: n("Galaxia de clientes", "circle") >= 100, windows: document.querySelectorAll('svg[aria-label^="Torre"] rect').length >= 300, light: n("Constelación de luz", "circle") >= 100, repairs: n("Ritmo de reparaciones", "rect") >= 10 }
      })
      console.log(`${w} more: ${JSON.stringify(more)}`)
      // Third round with the simulated operator: pulse monitors, continuity strips, hourglasses, packet paths, forecast.
      const carriers = await page.evaluate(() => {
        const n = (l, sel) => document.querySelector(`svg[aria-label="${l}"]`)?.querySelectorAll(sel).length ?? 0
        return { pulse: n("El pulso de los carriers", "path") >= 12, strips: n("Cinta de continuidad", "rect") >= 40, glasses: document.querySelectorAll('svg[aria-label*="Vendido"]').length >= 5, path: n("El camino del paquete", "circle") >= 20, forecast: n("Sugerencia: ¿cuándo se llena cada enlace?", "path") >= 15 }
      })
      console.log(`${w} carriers: ${JSON.stringify(carriers)}`)
      // Fourth round: money map (and flying into a deployment), traffic horizon, fault chord, payment contours, comparator.
      const x4 = await page.evaluate(() => {
        const n = (l, sel) => document.querySelector(`svg[aria-label="${l}"]`)?.querySelectorAll(sel).length ?? 0
        return { pack: n("Mapa de ingresos", "rect") >= 100, horizon: n("Latido del tráfico", "path") >= 25, chord: n("Qué falla y dónde", "path") >= 12, contours: n("Huella de pago", "path") >= 5, compare: n("Comparador de despliegues", "path") >= 10 }
      })
      const zoom = page.getByRole("group", { name: "Mapa de ingresos" }).getByRole("button").nth(1)
      await zoom.scrollIntoViewIfNeeded()
      await zoom.click()
      await page.waitForTimeout(1800)
      x4.zoomed = (await page.getByRole("group", { name: "Mapa de ingresos" }).locator('[aria-current="location"]').innerText()) !== "Todo"
      console.log(`${w} round4: ${JSON.stringify(x4)}`)
      // La red viva with the simulated operator: strands, carrier hubs, deployment buttons that pick one.
      const lv = await page.evaluate(() => {
        const svg = document.querySelector('svg[aria-label="La red viva"]')
        return { strands: (svg?.querySelectorAll("path").length ?? 0) >= 10, hubs: (svg?.textContent ?? "").includes("Carrier A") }
      })
      const pick = page.getByRole("group", { name: "Despliegues" }).getByRole("button").first()
      await pick.scrollIntoViewIfNeeded()
      await pick.click()
      lv.pick = (await pick.getAttribute("aria-pressed")) === "true"
      console.log(`${w} live: ${JSON.stringify(lv)}`)
      // Each new panel on its own, for review (the money map is zoomed into a deployment here).
      for (const [file, name] of [["pack", "Mapa de ingresos"], ["horizon", "Latido del tráfico"], ["chord", "Qué falla y dónde"], ["prints", "Huella de pago"], ["compare", "Comparador de despliegues"]]) {
        const panel = page.locator(`svg[aria-label="${name}"]`).first().locator("xpath=ancestor::section[1]")
        await panel.scrollIntoViewIfNeeded()
        await panel.screenshot({ path: path.join(SHOTS, `t2-${file}-${w}.png`) }).catch(() => undefined)
      }
      await page.screenshot({ path: path.join(SHOTS, `tablero2-demo-${w}.png`), fullPage: true })
      await page.getByRole("switch", { name: "Datos simulados" }).click()
      console.log(`${w} off: banner ${await page.getByText(/Estás viendo datos inventados/).count()}`)
      await ctx.close()
    }
    await browser.close()
    console.log("errors:", JSON.stringify(errors))
  } finally {
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id: router.id }) })
    await db.query(`delete from traffic_5m where router_id = $1`, [router.id])
    await db.query(`delete from router_metrics where router_id = $1`, [router.id])
    await db.query(`delete from outages where router_id = $1`, [router.id])
    for (const [t, v, fk] of [["clients", "client_versions", "client_id"], ["payments", "payment_versions", "payment_id"], ["reports", "report_versions", "report_id"], ["appointments", "appointment_versions", "appointment_id"], ["sites", "site_versions", "site_id"]]) {
      await db.query(`delete from ${v} where ${fk} like 'wdtest-t2-%'`).catch(() => undefined)
      await db.query(`delete from ${t} where id like 'wdtest-t2-%'`)
    }
    console.log("cleanup:", (await db.query(`select count(*)::int n from clients where id like 'wdtest-t2-%'`)).rows[0].n)
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
