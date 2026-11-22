// Report rate (2026-11-21 review): changing a router's rate takes effect when its new script is pasted ("Llave nueva");
// until then everything (silent, online, resend) is timed by the script's rate, so no false "router silent" outage.
const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP, BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const post = async (body) => (await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify(body) })).json()
const get = async (id) => (await (await fetch(BASE + "/api/interno/routers", { headers: H })).json()).routers.find((r) => r.id === id)

;(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  const c = await post({ action: "create", name: "Prueba Ritmo", siteId: "", pppoe: true, pollMinutes: 10 })
  const id = c.router.id
  console.log("created:", JSON.stringify({ chosen: c.router.pollMinutes, script: c.router.pollScript, scriptLine: /interval=10m/.test(c.script) }))
  await post({ action: "update", id, pollMinutes: 2 })
  let r = await get(id)
  console.log("after change:", JSON.stringify({ chosen: r.pollMinutes, script: r.pollScript }))
  const k = await post({ action: "rotate", id })
  r = await get(id)
  console.log("after new key:", JSON.stringify({ chosen: r.pollMinutes, script: r.pollScript, scriptLine: /interval=2m/.test(k.script) }))
  await post({ action: "delete", id })
  console.log("deleted:", !(await get(id)))
})().catch((e) => { console.error(e); process.exit(1) })
