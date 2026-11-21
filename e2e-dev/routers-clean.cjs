const { createRequire } = require("node:module")
const { Pool } = createRequire(require("node:path").join(__dirname, "..", "package.json"))("pg")
const fs = require("node:fs"), path = require("node:path")
;(async () => {
  const rid = fs.readFileSync(path.join(process.env.SP, "wd-rid.txt"), "utf8").trim()
  const p = new Pool({ connectionString: process.env.DATABASE_URL })
  const q = async (sql, a) => (await p.query(sql, a)).rowCount
  const out = {
    actions: await q("delete from router_actions where router_id = $1", [rid]),
    users: await q("delete from router_users where router_id = $1", [rid]),
    traffic: await q("delete from traffic_5m where router_id = $1", [rid]),
    vouchers: await q("delete from vouchers where router_id = $1", [rid]),
    router: await q("delete from routers where id = $1", [rid]),
    settings: await q("delete from wisp_settings where key = 'hotspot'"),
    clientVersions: await q("delete from client_versions where client_id = $1", ["wdtest-rt-client"]),
    client: await q("delete from clients where id = $1", ["wdtest-rt-client"]),
  }
  console.log(JSON.stringify(out))
  console.log("left routers:", (await p.query("select count(*) from routers")).rows[0].count)
  await p.end()
})().catch((e) => { console.error(e.message); process.exit(1) })
