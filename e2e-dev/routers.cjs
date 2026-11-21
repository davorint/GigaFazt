const fs = require("node:fs"), path = require("node:path")
const SP = process.env.SP
const BASE = "http://localhost:3000"
const H = { cookie: `gf_interno=${fs.readFileSync(path.join(SP, "cookie.txt"), "utf8")}`, "content-type": "application/json", "x-interno-nombre": "Prueba%20WD" }
const now = new Date().toISOString()
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
;(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE + "/es"); break } catch { await new Promise((r) => setTimeout(r, 1000)) } }
  // A late test client on a test deployment.
  const client = { id: "wdtest-rt-client", kind: "residencial", name: "Prueba Router", siteId: "wdtest-site-1", billingFrom: "2026-09", services: [{ id: "wdtest-rt-svc", type: "internet", status: "activo", plan: "200M", monthly: 396, start: "2026-09-01", pppoeUser: "prueba.rt" }], createdAt: now, updatedAt: now }
  console.log("client:", JSON.stringify((await j(await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [{ id: client.id, baseVersion: null, data: client, deleted: false, editedAt: now }] }) }))).results))
  const created = await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "create", name: "Prueba RT", siteId: "wdtest-site-1", pppoe: true, hotspot: true }) }))
  const rid = created.router.id
  const key = /Bearer ([\w-]+)\.([\w-]+)/.exec(created.script)[2]
  const auth = { authorization: `Bearer ${rid}.${key}`, "content-type": "text/plain" }
  console.log("script has key:", created.script.includes(key), "lines:", created.script.split("\n").length)
  const agent = (body) => fetch(BASE + "/api/routers/agente", { method: "POST", headers: auth, body }).then(async (r) => [r.status, await r.text()])
  console.log("bad key:", (await fetch(BASE + "/api/routers/agente", { method: "POST", headers: { authorization: `Bearer ${rid}.${"x".repeat(32)}` }, body: "" })).status)
  // 1) First report: the user on its plan, connected. Automatic off → nothing comes back; staff sees the difference.
  console.log("report 1 (auto off):", JSON.stringify(await agent("s;prueba.rt;200M;false;1;1000;5000\n")))
  let list = await j(await fetch(BASE + "/api/interno/routers", { headers: H }))
  let me = list.routers.find((r) => r.id === rid)
  console.log("diff:", JSON.stringify(me.changes.map((c) => [c.kind, c.user, c.profile])), "online:", me.online)
  // 2) Automatic on → the next report gets the suspension.
  await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "update", id: rid, auto: true }) })
  const [, a2] = await agent("s;prueba.rt;200M;false;1;3000;15000\n")
  console.log("report 2 (auto on):", JSON.stringify(a2))
  const actionId = a2.split(",")[0]
  // 3) The router did it → the service in Clientes is suspended.
  console.log("report 3 (done):", JSON.stringify(await agent(`d;${actionId};ok\ns;prueba.rt;DSX-suspendido;false;0;0;0\n`)))
  const pulled = await j(await fetch(BASE + "/api/interno/sync", { method: "POST", headers: H, body: JSON.stringify({ kind: "clients", since: 0, changes: [] }) }))
  const rec = pulled.records.find((r) => r.id === client.id)
  console.log("service status in Clientes:", rec.data.services[0].status, "version", rec.version)
  list = await j(await fetch(BASE + "/api/interno/routers", { headers: H }))
  me = list.routers.find((r) => r.id === rid)
  console.log("diff after:", me.changes.length, "actions:", JSON.stringify(me.actions.map((a) => [a.kind, a.user, a.arg1, a.status, a.source])))
  // 4) Traffic between report 1 and 2: +2000 up, +10000 down.
  console.log("traffic:", JSON.stringify(await j(await fetch(BASE + "/api/interno/trafico?user=prueba.rt&days=1", { headers: H }))))
  // 5) Create a missing user: the password comes back once.
  const cu = await j(await fetch(BASE + "/api/interno/routers", { method: "POST", headers: H, body: JSON.stringify({ action: "createUser", id: rid, user: "nuevo.rt", profile: "200M" }) }))
  console.log("createUser:", cu.user, "password length", cu.password.length)
  // 6) Hotspot: a plan and 3 vouchers.
  await fetch(BASE + "/api/interno/hotspot", { method: "PUT", headers: H, body: JSON.stringify({ plans: [{ id: "tst001", name: "Prueba 1 h", minutes: 60, mb: 0, rate: "5M/10M", price: 10 }] }) })
  const g = await j(await fetch(BASE + "/api/interno/hotspot", { method: "POST", headers: H, body: JSON.stringify({ action: "generate", routerId: rid, planId: "tst001", count: 3 }) }))
  console.log("vouchers:", g.codes && g.codes.length)
  const [, a6] = await agent("")
  console.log("report 6 lines:", JSON.stringify(a6.split("\n").map((l) => l.split(",").slice(1, 4).join(","))))
  fs.writeFileSync(path.join(SP, "wd-rid.txt"), rid)
})().catch((e) => { console.error(e); process.exit(1) })
