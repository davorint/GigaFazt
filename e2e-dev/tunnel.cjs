// Phase 11 (owner 2026-11-22): the WireGuard tunnel. Server settings, a router added (its script), its key, "use the
// tunnel" (Router en vivo now points at the server's forwarded ports), stop, remove. Puts the settings back; cleans up.
const { createRequire } = require("node:module")
const req = createRequire(require("node:path").join(__dirname, "..", "package.json"))
const { Pool } = req("pg")
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const KEY = "yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk="
const RKEY = "xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg="
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const T = (body) => fetch(BASE + "/api/interno/tunel", { method: "POST", headers: H, body: JSON.stringify(body) }).then(async (r) => [r.status, await j(r)])

;(async () => {
  const db = new Pool({ connectionString: process.env.DATABASE_URL })
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const before = (await j(await fetch(BASE + "/api/interno/tunel", { headers: H }))).settings
  const created = await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Prueba Tunel", siteId: "", pppoe: true }) }))
  const rid = created.router.id
  try {
    const rest = () => db.query(`select host, port, api_port from router_rest where router_id = $1`, [rid]).then((r) => JSON.stringify(r.rows[0] ?? null))
    console.log("use before joining:", (await T({ action: "use", id: rid, on: true }))[1].error)
    console.log("settings:", JSON.stringify((await T({ action: "settings", settings: { host: "tunel.prueba.com", publicKey: KEY, port: 51820 } }))[1].settings))
    const [, added] = await T({ action: "add", id: rid })
    console.log("router script:", /allowed-address=10\.77\.0\.1\/32/.test(added.script), /address=10\.77\.0\.\d+\/24/.test(added.script))
    console.log("bad key:", (await T({ action: "key", id: rid, key: "nope" }))[0])
    console.log("key:", (await T({ action: "key", id: rid, key: RKEY }))[0])
    const g = await j(await fetch(BASE + "/api/interno/tunel", { headers: H }))
    console.log("server script has peer:", g.vps.includes(`PublicKey = ${RKEY}`), "dnat:", new RegExp(`tcp dport ${20000 + 2 * added.n} dnat to 10\.77\.0\.${added.n + 1}:443`).test(g.vps))
    console.log("use:", (await T({ action: "use", id: rid, on: true }))[0], await rest())
    console.log("state:", (await j(await fetch(BASE + "/api/interno/tunel", { headers: H }))).peers.find((p) => p.routerId === rid).usingTunnel)
    console.log("stop:", (await T({ action: "use", id: rid, on: false }))[0], await rest())
    await T({ action: "use", id: rid, on: true })
    console.log("remove:", (await T({ action: "remove", id: rid }))[0], await rest())
  } finally {
    await T({ action: "settings", settings: before })
    await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "delete", id: rid }) })
    console.log("left:", (await db.query(`select count(*)::int n from router_tunnels where router_id = $1`, [rid])).rows[0].n)
    await db.end()
  }
})().catch((e) => { console.error(e); process.exit(1) })
