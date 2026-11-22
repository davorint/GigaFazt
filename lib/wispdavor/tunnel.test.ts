import { describe, expect, it } from "vitest"
import { decodeSettings, forwardPorts, nextNumber, peerIp, routerScript, validKey, vpsScript } from "./tunnel"

const KEY = "yAnz5TF+lXXJte14tji3zlMNq+hd2rYUIgJBgB3fBmk="
const KEY2 = "xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg="

describe("Phase 11: tunnel", () => {
  it("keys, hosts, addresses and ports", () => {
    expect(validKey(KEY)).toBe(true)
    expect(validKey("abc=")).toBe(false)
    expect(decodeSettings({ host: "Tunel.GigaFazt.com", publicKey: KEY, port: 51820 })).toEqual({ host: "tunel.gigafazt.com", publicKey: KEY, port: 51820 })
    expect(decodeSettings({ host: "no host", publicKey: "x" })).toEqual({ host: "", publicKey: "", port: 51820 })
    expect(peerIp(1)).toBe("10.77.0.2")
    expect(forwardPorts(3)).toEqual({ rest: 20006, api: 20007 })
    expect(nextNumber([1, 2, 4])).toBe(3)
  })
  it("the router's script: its interface, the server as peer, its address, a firewall rule only for the server", () => {
    const s = routerScript({ host: "tunel.gigafazt.com", publicKey: KEY, port: 51820 }, { n: 2, name: "Torre A" }, { rest: 443, api: 8729 })
    expect(s).toContain("/interface wireguard add name=wg-gigafazt listen-port=13231")
    expect(s).toContain(`public-key="${KEY}" endpoint-address=tunel.gigafazt.com endpoint-port=51820 allowed-address=10.77.0.1/32 persistent-keepalive=25s`)
    expect(s).toContain("/ip address add address=10.77.0.3/24 interface=wg-gigafazt")
    expect(s).toContain("src-address=10.77.0.1 protocol=tcp dst-port=443,8729 action=accept place-before=0")
    expect(s.split("\n").at(-1)).toBe(":put [/interface wireguard get [find name=wg-gigafazt] public-key]")
  })
  it("the server's script: only routers with a key are peers; each gets its two ports; no private key in it", () => {
    const v = vpsScript({ host: "tunel.gigafazt.com", publicKey: KEY, port: 51820 }, [
      { routerId: "a", name: "Torre A", n: 1, publicKey: KEY2, restPort: 443, apiPort: 8729 },
      { routerId: "b", name: "Torre B", n: 2, publicKey: "", restPort: 8443, apiPort: 8729 },
    ])
    expect(v).toContain(`PublicKey = ${KEY2}\nAllowedIPs = 10.77.0.2/32`)
    expect(v.match(/\[Peer\]/g)).toHaveLength(1)
    expect(v).toContain("tcp dport 20002 dnat to 10.77.0.2:443")
    expect(v).toContain("tcp dport 20004 dnat to 10.77.0.3:8443")
    expect(v).not.toContain("flush ruleset")
    expect(v).not.toMatch(/PrivateKey\s*=/)
  })
})
