// Phase 7 (owner 2026-11-22): configuration copies. The router's agent gets a "backup" action and posts its /export in
// pieces to /api/routers/respaldo; the site keeps one copy, doesn't keep an identical one again, keeps a changed one, and
// the copy can be downloaded and compared.
const fs = require("node:fs"), path = require("node:path")
const { createRequire } = require("node:module")
const req = createRequire(path.join(process.cwd(), "package.json"))
const { Pool } = req("pg")
const SP = process.env.SP, BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

;(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const created = await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Prueba Respaldo", siteId: "", pppoe: true }) }))
  const rid = created.router.id
  const key = /Bearer ([\w-]+)\.([\w-]+)/.exec(created.script)[2]
  const auth = `Bearer ${rid}.${key}`
  try {
    console.log("script backup step:", /\/export file=wispdavor-cfg/.test(created.script), /policy=read,write,test,ftp/.test(created.script))
    // Staff ask for a copy; asking twice queues one.
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "backup", id: rid }) })
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "backup", id: rid }) })
    const acts = (await pool.query(`select id from router_actions where router_id = $1 and kind = 'backup'`, [rid])).rows
    console.log("queued:", acts.length)
    // A big configuration (about 120 KB, several pieces).
    const lines = ["# 2026-11-22 03:00:01 by RouterOS 7.25.1", "/ppp profile", "add name=200M rate-limit=200M/200M"]
    for (let i = 0; i < 1800; i++) lines.push(`add name=cliente${i} profile=200M service=pppoe comment="Depto ${i} ñ"`)
    const cfg = lines.join("\n")
    const send = async (upload, text) => {
      const n = Math.ceil(text.length / 30000)
      const out = []
      for (let i = 0; i < n; i++) {
        const r = await fetch(BASE + "/api/routers/respaldo", { method: "POST", headers: { authorization: auth, "content-type": "text/plain", "x-wd-backup": `${upload}/${i}/${n}` }, body: text.slice(i * 30000, (i + 1) * 30000) })
        out.push(`${r.status}:${await r.text()}`)
      }
      return out.join(" ")
    }
    console.log("bad key:", (await fetch(BASE + "/api/routers/respaldo", { method: "POST", headers: { authorization: `Bearer ${rid}.${"x".repeat(32)}`, "x-wd-backup": "1/0/1" }, body: "x" })).status)
    console.log("bad header:", (await fetch(BASE + "/api/routers/respaldo", { method: "POST", headers: { authorization: auth, "x-wd-backup": "1/2/1" }, body: "x" })).status)
    console.log("first copy:", await send(acts[0].id, cfg))
    console.log("same again, new date:", await send(acts[0].id + "9", cfg.replace("2026-11-22 03:00:01", "2026-11-23 03:00:02")))
    console.log("changed:", await send(acts[0].id + "8", cfg.replace('add name=cliente7 profile=200M', 'add name=cliente7 profile=500M')))
    const list = await j(await fetch(BASE + "/api/interno/routers/rest", { method: "POST", headers: H, body: JSON.stringify({ action: "backups", id: rid }) }))
    console.log("copies:", list.backups.length, "by:", list.backups.map((b) => `${b.source}/${b.by}`).join(","), "checked:", Boolean(list.backups[1].checkedAt))
    const text = await (await fetch(`${BASE}/api/interno/routers/rest?respaldo=${list.backups[1].id}`, { headers: H })).text()
    console.log("download intact:", text === cfg)
    console.log("parts left:", (await pool.query(`select count(*)::int as n from router_backup_parts where router_id = $1`, [rid])).rows[0].n)
  } finally {
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id: rid }) })
    console.log("copies left after delete:", (await pool.query(`select count(*)::int as n from router_backups where router_id = $1`, [rid])).rows[0].n)
    await pool.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
