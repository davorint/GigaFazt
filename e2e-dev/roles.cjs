// Phase 14 (owner 2026-11-22): roles and the activity log. A técnico account (inserted straight in the database: making
// it through the API would make the first account an admin and end the shared password the other scenarios use), its
// session minted like run.mjs does; what the server refuses it, what the pages show it; the activity log as admin.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const { chromium } = req("playwright")
const fs = require("node:fs"), path = require("node:path")
const { execFileSync } = require("node:child_process")
const SP = process.env.SP, BASE = "http://localhost:3000"
const root = path.join(__dirname, "..")
const admin = fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")
const HA = { cookie: `gf_interno=${admin}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const m = (await db.query(`insert into team_members (name, pass_hash, admin, role) values ('Prueba Técnico', 'x', false, 'tecnico') returning id`)).rows[0]
  try {
    const out = path.join(SP, "tech-cookie.txt").replace(/\\/g, "/")
    fs.writeFileSync(path.join(SP, "mint-tech.test.ts"), `import { it } from "vitest"\nimport { writeFileSync } from "node:fs"\nit("mint", async () => {\n  const auth = await import(${JSON.stringify(path.join(root, "lib", "internal-auth.ts").replace(/\\/g, "/"))})\n  writeFileSync(${JSON.stringify(out)}, await auth.newSession(Date.now(), ${JSON.stringify(m.id)}))\n})\n`)
    execFileSync(process.execPath, ["--env-file=.env.local", "node_modules/vitest/vitest.mjs", "run", "--root", SP, "--dir", SP, path.join(SP, "mint-tech.test.ts")], { cwd: root, stdio: "ignore" })
    const tech = fs.readFileSync(out, "utf8")
    const HT = { cookie: `gf_interno=${tech}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20T%C3%A9cnico" }
    const sync = (kind) => fetch(BASE + "/api/interno/sync", { method: "POST", headers: HT, body: JSON.stringify({ kind, since: 0, changes: [] }) }).then((r) => r.status)
    console.log("yo:", JSON.stringify((await (await fetch(BASE + "/api/interno/yo", { headers: HT })).json()).access))
    console.log("sync clients:", await sync("clients"), "payments:", await sync("payments"), "porpagar:", await sync("porpagar"))
    const w = await (await fetch(BASE + "/api/interno/sync", { method: "POST", headers: HT, body: JSON.stringify({ kind: "payments", since: 0, changes: [{ id: "wdtest-ro-pay", baseVersion: null, data: { id: "wdtest-ro-pay", clientId: "x", date: "2026-11-01", amount: 1, method: "efectivo" }, deleted: false, editedAt: new Date().toISOString() }] }) })).json()
    console.log("payment write:", w.results[0].outcome, w.results[0].reason, "saved:", (await db.query(`select count(*)::int n from payments where id = 'wdtest-ro-pay'`)).rows[0].n)
    console.log("whatsapp:", (await fetch(BASE + "/api/interno/whatsapp", { method: "POST", headers: HT, body: JSON.stringify({ template: "recordatorio", items: [] }) })).status)
    console.log("portal:", (await fetch(BASE + "/api/interno/portal", { method: "POST", headers: HT, body: JSON.stringify({ clientId: "x" }) })).status)
    console.log("activity:", (await fetch(BASE + "/api/interno/actividad", { headers: HT })).status, "backup:", (await fetch(BASE + "/api/interno/respaldo", { headers: HT })).status)
    const browser = await chromium.launch()
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    await ctx.addCookies([{ name: "gf_interno", value: tech, domain: "localhost", path: "/" }])
    await ctx.addInitScript(() => { try { localStorage.setItem("gigafazt-sync", JSON.stringify({ name: "Prueba Técnico" })) } catch {} })
    const page = await ctx.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto(`${BASE}/interno/admin/cuentas-por-pagar`)
    await page.getByRole("alertdialog").waitFor({ timeout: 15000 })
    console.log("blocked page:", await page.getByRole("heading", { name: "Sin acceso" }).count())
    await page.goto(`${BASE}/interno`)
    await page.waitForFunction(() => document.querySelector('nav a[href="/interno/admin/cuentas-por-pagar"]')?.closest("li")?.hidden === true, null, { timeout: 15000 })
    const shown = await page.evaluate(() => [...[...document.querySelectorAll("nav")].at(-1).querySelectorAll("a[data-nav]")].filter((a) => !a.closest("li").hidden).map((a) => a.textContent.trim()))
    console.log("menu:", JSON.stringify(shown))
    console.log("backup buttons hidden:", await page.evaluate(() => document.querySelector('[data-area="backup"]')?.hidden), await page.evaluate(() => document.querySelector('[data-area="files"]')?.hidden))
    console.log("home blocked:", await page.getByRole("alertdialog").count())
    await browser.close()
    const act = await (await fetch(BASE + "/api/interno/actividad?dias=1", { headers: HA })).json()
    console.log("admin activity:", act.entries.length > 0, "kinds ok:", act.entries.every((e) => e.at && e.kind && e.what), "errors:", JSON.stringify(errors))
  } finally {
    console.log("cleanup:", (await db.query(`delete from team_members where id = $1`, [m.id])).rowCount)
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
