import { describe, expect, it } from "vitest"
import { EXPORT_SCRIPT, isReadOp, normalizeFingerprint, opProblem, opToApi, opToRest, setupCommands, validHost, type Op } from "./rest"
import { collectReply, decodeLength, encodeLength, encodeSentence, readSentences } from "./ros-api"

describe("Router access: what counts as reading (read-only mode, REST and API alike)", () => {
  it("print, monitor-traffic and the exact export read; set, remove, add and any other command write", () => {
    const ops: [Op, boolean][] = [
      [{ kind: "print", menu: "/ppp/secret", where: { name: "ana" } }, true],
      [{ kind: "cmd", menu: "/interface", cmd: "monitor-traffic", params: { interface: "ether1", once: "" } }, true],
      [{ kind: "cmd", menu: "", cmd: "execute", params: { script: EXPORT_SCRIPT, "as-string": "" } }, true],
      [{ kind: "cmd", menu: "", cmd: "execute", params: { script: "/system reboot" } }, false],
      [{ kind: "cmd", menu: "/system", cmd: "reboot", params: {} }, false],
      [{ kind: "set", menu: "/ppp/secret", id: "*1", props: { profile: "200M" } }, false],
      [{ kind: "remove", menu: "/ppp/active", id: "*2" }, false],
      [{ kind: "add", menu: "/ppp/secret", props: { name: "x" } }, false],
    ]
    for (const [op, read] of ops) expect(isReadOp(op)).toBe(read)
  })
  it("the same operation over REST (manual: GET/PATCH/DELETE/PUT/POST) and over the API (words)", () => {
    const print: Op = { kind: "print", menu: "/ppp/secret", where: { name: "ana" }, proplist: [".id", "name"] }
    expect(opToRest(print)).toEqual({ method: "GET", path: "/ppp/secret?name=ana&.proplist=.id%2Cname" })
    expect(opToApi(print)).toEqual(["/ppp/secret/print", "=.proplist=.id,name", "?name=ana"])
    const set: Op = { kind: "set", menu: "/ppp/secret", id: "*1A", props: { profile: "200M" } }
    expect(opToRest(set)).toEqual({ method: "PATCH", path: "/ppp/secret/*1A", body: { profile: "200M" } })
    expect(opToApi(set)).toEqual(["/ppp/secret/set", "=.id=*1A", "=profile=200M"])
    expect(opToApi({ kind: "remove", menu: "/ppp/active", id: "*2" })).toEqual(["/ppp/active/remove", "=.id=*2"])
    expect(opToRest({ kind: "cmd", menu: "/interface", cmd: "monitor-traffic", params: { interface: "ether1", once: "" } })).toEqual({ method: "POST", path: "/interface/monitor-traffic", body: { interface: "ether1", once: "" } })
  })
  it("unsafe operations are refused before they leave", () => {
    expect(opProblem({ kind: "print", menu: "/ppp/../x" })).toBe("menu")
    expect(opProblem({ kind: "set", menu: "/ppp/secret", id: "ana", props: {} })).toBe("id")
    expect(opProblem({ kind: "print", menu: "/ppp/secret", where: { name: "a\u0000=b" } })).toBe("value")
    expect(opProblem({ kind: "print", menu: "/ppp/secret", where: { name: "ana" } })).toBe("")
  })
  it("addresses and certificate fingerprints are checked", () => {
    expect([validHost("edificio1.dynu.net"), validHost("10.0.0.1"), validHost("bad host"), validHost("x;rm")]).toEqual([true, true, false, false])
    const hex = "ab".repeat(32)
    expect(normalizeFingerprint("AB:".repeat(31) + "AB")).toBe(hex)
    expect(normalizeFingerprint(`sha256:${hex.toUpperCase()}`)).toBe(hex)
    expect(normalizeFingerprint("abc")).toBe("")
  })
  it("setup: certificates on www-ssl and api-ssl, plain services off, own groups (the built-in read group can reboot)", () => {
    const s = setupCommands({ restPort: 8443, apiPort: 8729, dnsName: "edificio1.dynu.net" })
    expect(s).toContain("/ip service set www-ssl disabled=no port=8443")
    expect(s).toContain("/ip service set api-ssl disabled=no port=8729")
    expect(s).toContain("/ip service set api disabled=yes")
    expect(s).toContain("policy=read,api,rest-api")
    expect(s).not.toMatch(/group=read\b/)
    expect(s).not.toContain(",policy")
  })
})

describe("MikroTik API wire format (manual: Developer guides → API)", () => {
  it("lengths in 1 to 5 bytes, and back", () => {
    for (const [n, size] of [[0, 1], [0x7f, 1], [0x80, 2], [0x3fff, 2], [0x4000, 3], [0x1fffff, 3], [0x200000, 4], [0xfffffff, 4], [0x10000000, 5]] as const) {
      const b = encodeLength(n)
      expect(b.length).toBe(size)
      expect(decodeLength(b)).toEqual({ n, size })
    }
    expect(() => decodeLength(Buffer.from([0xf8]))).toThrow()
  })
  it("sentences end with an empty word; partial input waits; replies become records, !done, !trap", () => {
    const a = encodeSentence(["!re", "=name=ana", "=profile=200M"])
    const b = encodeSentence(["!done"])
    const partial = readSentences(Buffer.concat([a, b.subarray(0, 2)]))
    expect(partial.sentences).toEqual([["!re", "=name=ana", "=profile=200M"]])
    const all = readSentences(Buffer.concat([partial.rest, b.subarray(2)]))
    expect(all.sentences).toEqual([["!done"]])
    expect(collectReply([["!re", "=name=ana", "=comment=a=b"], ["!done"]])).toMatchObject({ records: [{ name: "ana", comment: "a=b" }], finished: true, trap: "" })
    expect(collectReply([["!trap", "=message=invalid user name or password (6)"], ["!done"]])).toMatchObject({ trap: "invalid user name or password (6)", finished: true })
    expect(collectReply([["!done", "=ret=*12"]]).done).toEqual({ ret: "*12" })
  })
})
