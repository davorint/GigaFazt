/**
 * The deployment's file with every expert script on, checked as a whole: each guard that stops when something is
 * missing finds it created by an earlier step (so a one-shot /import doesn't stop halfway), each "already here" guard
 * isn't tripped by an earlier step, and the undo file removes everything the file creates.
 */
import { describe, expect, it } from "vitest"
import { BUNDLE_ORDER } from "./bundle"
import { deploymentBundle } from "./guide-scripts"
import { parseScript, type RosCommand } from "./ros-parse"
import { DEFAULT_SETUP } from "./setup"
import { initialState, type LabState } from "./state"

const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const FIELD = /\b([a-z][a-z0-9-]*)=(?:"((?:[^"\\]|\\.)*)"|([^\s\]}]+))/g
/** RouterOS reads \$ inside a quoted string as $. */
const unescape = (v: string) => v.replace(/\\(["\\$])/g, "$1")

function full(): LabState {
  const s = initialState()
  const wan = s.wans[0].name
  return {
    ...s,
    setup: {
      ...DEFAULT_SETUP,
      alert: "telegram",
      telegramChat: "123456789",
      backup: "sftp",
      backupHost: "192.168.10.60",
      backupUser: "respaldos",
      backupPath: "/srv/mk",
      snmp: true,
      collector: "192.168.10.50",
      ipv6Pd: "2001:db8:100::/40",
      ipv6Wan: "2001:db8:200::/40",
    },
    advanced: {
      on: [...BUNDLE_ORDER],
      o: {
        morosos: { noticeUrl: "https://gigafazt.com/aviso", allow: "pagos.example.com" },
        destinos: { rules: [{ wan, dest: "198.51.100.0/24" }] },
        ippublica: { rows: [{ user: "empresa1", ip: "203.0.113.20", wan }] },
        bgp: { asn: 273000, routerId: "203.0.113.1", prefixes: "203.0.113.0/24", peers: "carrierA,198.51.100.1,65010,0" },
        bond: { ports: "sfp-sfpplus2, sfp-sfpplus3", oltPorts: "0/2/0, 0/3/0" },
        failover: { lte: "lte1", lteMbps: 50 },
      },
    },
  }
}

const fields = (c: RosCommand) => [...c.text.matchAll(FIELD)].map((m) => [m[1], unescape(m[2] ?? m[3])] as const)

/** "find where name="X"" / comment="X" / comment~"re" guards: [menu, field, op, value, missing-or-present]. */
const GUARD = /:if \(\[:len \[(\/[a-z0-9 -]+?) find where (name|comment)(=|~)"((?:[^"\\]|\\.)*)"\]\] (=|>) 0\) do=\{:error/g

describe("the deployment file with every expert script", () => {
  const b = deploymentBundle(full())
  it("includes every expert script", () => {
    expect(b.skipped).toEqual([])
    expect(new Set(b.steps.map((x) => x.group)).size).toBe(BUNDLE_ORDER.length + 1)
  })

  it("every guard is satisfied by an earlier step, and no 'already here' guard by one", () => {
    const problems: string[] = []
    let checked = 0
    b.steps.forEach((st, i) => {
      const before = b.steps.slice(0, i).flatMap((x) => parseScript(x.script)).filter((c) => c.verb === "add")
      for (const [, menu, f, op, raw, cmp] of st.script.matchAll(GUARD)) {
        checked++
        const v = unescape(raw)
        const made = before.some((c) => c.menu === menu && fields(c).some(([k, x]) => k === f && (op === "=" ? x === v : new RegExp(v).test(x))))
        if (cmp === "=" && !made) problems.push(`${st.group}/${st.id} needs ${menu} ${f}${op}${v}, no earlier step creates it`)
        if (cmp === ">" && made) problems.push(`${st.group}/${st.id} stops on ${menu} ${f}${op}${v}, which an earlier step creates`)
      }
    })
    expect(problems).toEqual([])
    expect(checked).toBeGreaterThanOrEqual(12)
  })

  it("the undo file removes everything the file creates (plan profiles, Back To Home users and the memory log rule stay on purpose)", () => {
    const undo = parseScript(b.undo).filter((c) => c.verb === "remove")
    const removed = (menu: string, f: string, v: string) =>
      undo.some((u) => {
        if (u.menu !== menu) return false
        if (new RegExp(`${f}=("?)${esc(v)}\\1(?=[\\s\\]])`).test(u.text)) return true
        const re = new RegExp(`${f}~"((?:[^"\\\\]|\\\\.)+)"`).exec(u.text)
        return re ? new RegExp(unescape(re[1])).test(v) : false
      })
    const kept = [/^DS: plan /, /^\/ip cloud back-to-home-user /, /^\/system logging .*action=memory/]
    const left = new Set<string>()
    for (const st of b.steps)
      for (const c of parseScript(st.script)) {
        if (c.verb !== "add") continue
        const f = fields(c)
        if (f.some(([k, v]) => removed(c.menu, k, v))) continue
        const id = f.find(([k]) => k === "comment") ?? f.find(([k]) => k === "name")
        const label = id ? id[1] : `${c.menu} ${c.text.trim().slice(0, 80)}`
        if (kept.some((k) => k.test(label) || k.test(`${c.menu} ${c.text.trim()}`))) continue
        left.add(`${st.group}: ${c.menu} ${label}`)
      }
    expect([...left]).toEqual([])
  })
})
