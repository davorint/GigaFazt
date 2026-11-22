// WispDavor end-to-end checks against the dev database (owner, 2026-11-21: "move the tests into the repo").
// What it needs: .env.local pointing at the dev branch (DATABASE_URL, INTERNO_* and ROUTER_CRED_KEY), a production
// build (`npm run build`), openssl on the PATH, and port 3000 and the fake router's ports 18443/18729 free.
// It mints a sign-in session, makes the fake MikroTik's certificate, starts the fake MikroTik (REST + API-SSL) and the
// site, runs every scenario (each seeds its own data and removes it), and checks each one's output against what it
// must show. Never against production: the scenarios write to the database. Usage: `npm run e2e:dev`.
import { execFileSync, spawn } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const SP = mkdtempSync(join(tmpdir(), "wispdavor-e2e-"))
const node = process.execPath

/** Each scenario, in order, with what its output must contain (a regex per line). */
const SCENARIOS = [
  ["routers.cjs", [/bad key: 401/, /report 2 \(auto on\): "\d+,profile,prueba\.rt,DSX-suspendido"/, /service status in Clientes: suspendido/, /diff after: 0/, /vouchers: 3/]],
  ["routers-clean.cjs", [/left routers: 0/]],
  ["rate.cjs", [/created: \{"chosen":10,"script":10,"scriptLine":true\}/, /after change: \{"chosen":2,"script":10\}/, /after new key: \{"chosen":2,"script":2,"scriptLine":true\}/, /deleted: true/]],
  ["monitoring.cjs", [/drop to 3: 200 \[\{"kind":"sesiones"/, /banner shown: 1/, /recovered to 9: 200 .*"ended_at":"/, /carriers silent: 200 \{"kind":"carrier"/, /carrier back: 200 .*"ended_at":"/, /monitor page overflow: 0 errors: \[\]/]],
  ["tecnico.cjs", [/server record: \{"status":"hecha","arrived":true,"done":true,"files":\["foto","firma"\]/, /overflow: 0 errors: \[\]/]],
  ["funnel.cjs", [/rows: pagó solo el .+ \| avisado · pagó tras el aviso el .+ \| sigue debiendo/, /overflow: 0 errors: \[\]/]],
  [
    "rest-api.cjs",
    [/== rest ==/, /== api ==/, /API connections for the live view: 1/, /act read-only: 403 read-only[\s\S]*act read-only: 403 read-only/, /act suspend: 200 suspend:DSX-suspendido[\s\S]*act suspend: 200 suspend:DSX-suspendido/, /toggle shows API selected: true/, /after click, saved protocol: rest/, /probar disabled when unsaved: true/, /after a timer refresh, view still there: true/, /overflow: 0 errors: \[\]/],
  ],
  [
    "conflicts.cjs",
    [/auto, late: reconnect: 409 auto-late/, /auto: plan 500M: 409 auto-plan/, /auto: disable: 409 auto-disable/, /auto: kick: 200 kick/, /auto, paid: suspend: 200 suspend:DSX-suspendido/, /Clientes: \{"status":"suspendido","hold":true,"holdOpen":true\}/, /auto, held: reconnect: 200 reconnect:200M/, /Clientes: \{"status":"activo","hold":false\}/, /manual, late: reconnect: 200 reconnect:200M/, /debt suspension, no hold\): \{"status":"suspendido","hold":false\}/],
  ],
  ["backups.cjs", [/script backup step: true true/, /queued: 1/, /bad key: 401/, /bad header: 400/, /first copy: (200:partial ){2,}200:new/, /same again, new date: (200:partial ){2,}200:same/, /changed: (200:partial ){2,}200:new/, /copies: 2 by: agente\/Router,agente\/Prueba WD checked: true/, /download intact: true/, /parts left: 0/, /copies left after delete: 0/]],
  ["outbox-portal.cjs", [/back online: stored files: 1 linked to the job: 1 banner gone: true/, /reports: \["Solicitud de cambio de plan/, /pdf: .* %PDF-1\.4 .* accents: true/, /errors: \[\]/]],
]

const children = []
const start = (args, env = {}) => {
  const c = spawn(node, args, { cwd: root, env: { ...process.env, ...env }, stdio: "ignore" })
  children.push(c)
  return c
}
const stopAll = () => {
  for (const c of children) c.kill()
}
process.on("exit", stopAll)
process.on("SIGINT", () => process.exit(130))

let failed = 0
try {
  // 1. A sign-in session (the site's own code mints it, with the dev secrets).
  writeFileSync(join(SP, "mint.test.ts"), `import { it } from "vitest"\nimport { writeFileSync } from "node:fs"\nit("mint", async () => {\n  const auth = await import(${JSON.stringify(join(root, "lib", "internal-auth.ts").replace(/\\/g, "/"))})\n  writeFileSync(${JSON.stringify(join(SP, "cookie.txt").replace(/\\/g, "/"))}, await auth.newSession())\n})\n`)
  execFileSync(node, ["--env-file=.env.local", "node_modules/vitest/vitest.mjs", "run", "--root", SP, "--dir", SP, join(SP, "mint.test.ts")], { cwd: root, stdio: "ignore" })
  if (!readFileSync(join(SP, "cookie.txt"), "utf8")) throw new Error("no session")
  // 2. The fake MikroTik's certificate (self-signed; the scenarios pin its SHA-256 fingerprint).
  const fake = join(SP, "fakeros")
  mkdirSync(fake)
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(fake, "key.pem"), "-out", join(fake, "cert.pem"), "-days", "2", "-subj", "/CN=fake-router"], { stdio: "ignore" })
  const fp = execFileSync("openssl", ["x509", "-in", join(fake, "cert.pem"), "-noout", "-fingerprint", "-sha256"]).toString().split("=")[1].trim()
  writeFileSync(join(fake, "fp.txt"), fp)
  // 3. The fake MikroTik and the site.
  start([join(here, "fake-router.cjs")], { FAKE_DIR: fake })
  start(["--env-file=.env.local", "node_modules/next/dist/bin/next", "start", "-p", "3000"])
  // 4. The scenarios.
  for (const [file, expect] of SCENARIOS) {
    let out = ""
    try {
      out = execFileSync(node, ["--env-file=.env.local", join(here, file)], { cwd: root, env: { ...process.env, SP }, timeout: 300000, stdio: ["ignore", "pipe", "pipe"] }).toString()
    } catch (e) {
      out = `${e.stdout ?? ""}\n${e.stderr ?? ""}`
    }
    const missing = expect.filter((re) => !re.test(out))
    if (missing.length) {
      failed++
      console.log(`✗ ${file}\n  missing: ${missing.map(String).join("\n           ")}\n  output:\n${out.split("\n").map((l) => `    ${l}`).join("\n")}`)
    } else console.log(`✓ ${file}`)
  }
} catch (e) {
  failed++
  console.log(`✗ setup: ${e instanceof Error ? e.message : e}`)
} finally {
  stopAll()
  rmSync(SP, { recursive: true, force: true })
}
console.log(failed ? `\n${failed} failed` : "\nall passed")
process.exit(failed ? 1 : 0)
