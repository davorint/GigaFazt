/**
 * Hardware sizing for AsterNOS-VPP (owner, 2026-11-20). Only published vendor figures are used as limits, each with its
 * source; nothing here is a measured benchmark:
 * - AsterNOS-RT-VPP datasheet (2026): ET2508-4S4M8 with license LIC-E2: L3 forwarding 58 Gbps, ACL filtering (10K rules)
 *   58 Gbps, IPsec 50 Gbps; minimum for a VM: 4 cores, 4 GB RAM, DPDK NIC, KVM or ESXi with VirtIO.
 *   https://cloudswit.ch/wp-content/uploads/2026/06/Datasheet-AsterNOS-RT-VPP-2026052.pdf
 * - ET2500 datasheet (2026-08): Marvell OCTEON 10 CN102, 8 × Arm Neoverse N2 @ 2.5 GHz, 16 GB DDR5 (up to 48 GB),
 *   ports 4×10GE SFP+, 4×2.5GE, 8×1GE, routing 58 Gbps, < 60 W.
 *   https://cloudswit.ch/wp-content/uploads/2026/08/Datasheet-ET2500-Edge-Network-Appliance-20260811.pdf
 * - AsterNOS-VPP BNG white paper (2026-10-10): up to 50,000 PPPoE sessions; CGNAT 2.09 M sessions with 16 GB, 10 M
 *   with 32 GB. https://cloudswit.ch/whitepapers/asternos-vpp-bng/
 * A VM's throughput isn't published: it's estimated per core from the ET2500 figure (58 Gbps ÷ 8 cores) and marked as
 * an estimate to replace with a measurement.
 */

export type Platform = "et2508" | "vm"

export type SizingInput = {
  platform: Platform
  /** VM only: cores and RAM given to it. */
  vmCores: number
  vmRamGB: number
  /** ET2508: installed RAM (16 standard, up to 48). */
  et2508RamGB: number
  /** Peak traffic through the gateway, Mbps (download + upload). */
  peakMbps: number
  /** Average packet size, bytes (an assumption: real traffic mixes large downloads and small acks). */
  avgPacketBytes: number
  clients: number
  /** NAT sessions per client at the busy hour (an assumption). */
  sessionsPerClient: number
  /** Per-address rules, policers and HQoS users the configuration creates (lib/asternos/config.ts counts them). */
  aclRules: number
  policers: number
  hqosUsers: number
}

export const LIMITS = {
  et2508Gbps: 58,
  et2508Cores: 8,
  aclRulesAtLineRate: 10_000,
  pppoeSessions: 50_000,
  vmMinCores: 4,
  vmMinRamGB: 4,
  /** CGNAT sessions published per RAM size (GB → sessions). */
  cgnat: [
    [16, 2_090_000],
    [32, 10_000_000],
  ] as [number, number][],
}

export type Check = { id: string; level: "ok" | "warn" | "bad" | "info"; value: number; limit: number | null }

/** Published CGNAT sessions for this much RAM (the largest published point at or below it), or null below 16 GB. */
export function cgnatSessions(ramGB: number): number | null {
  const fit = LIMITS.cgnat.filter(([gb]) => ramGB >= gb)
  return fit.length ? fit[fit.length - 1][1] : null
}

/** Throughput the platform is rated (ET2508) or estimated (VM) for, Gbps. */
export function platformGbps(i: SizingInput): { gbps: number; estimated: boolean } {
  if (i.platform === "et2508") return { gbps: LIMITS.et2508Gbps, estimated: false }
  // One core runs VPP's main thread; the rest forward (assumption, to measure).
  const workers = Math.max(1, i.vmCores - 1)
  return { gbps: (LIMITS.et2508Gbps / LIMITS.et2508Cores) * workers, estimated: true }
}

export function sizing(i: SizingInput): { checks: Check[]; mpps: number; gbps: number; estimated: boolean } {
  const { gbps, estimated } = platformGbps(i)
  const needGbps = i.peakMbps / 1000
  const mpps = (i.peakMbps * 1e6) / (Math.max(64, i.avgPacketBytes) * 8) / 1e6
  const ram = i.platform === "vm" ? i.vmRamGB : i.et2508RamGB
  const sessions = i.clients * i.sessionsPerClient
  const cgnat = cgnatSessions(ram)
  const level = (use: number, limit: number): Check["level"] => (use <= limit * 0.7 ? "ok" : use <= limit ? "warn" : "bad")
  const checks: Check[] = [
    { id: "throughput", level: level(needGbps, gbps), value: needGbps, limit: gbps },
    { id: "aclRules", level: level(i.aclRules, LIMITS.aclRulesAtLineRate), value: i.aclRules, limit: LIMITS.aclRulesAtLineRate },
    { id: "pppoe", level: level(i.clients, LIMITS.pppoeSessions), value: i.clients, limit: LIMITS.pppoeSessions },
    { id: "nat", level: cgnat === null ? "info" : level(sessions, cgnat), value: sessions, limit: cgnat },
    { id: "policers", level: "info", value: i.policers, limit: null },
    { id: "hqosUsers", level: "info", value: i.hqosUsers, limit: null },
  ]
  if (i.platform === "vm") {
    checks.push({ id: "vmCores", level: i.vmCores >= LIMITS.vmMinCores ? "ok" : "bad", value: i.vmCores, limit: LIMITS.vmMinCores })
    checks.push({ id: "vmRam", level: i.vmRamGB >= LIMITS.vmMinRamGB ? "ok" : "bad", value: i.vmRamGB, limit: LIMITS.vmMinRamGB })
  }
  return { checks, mpps, gbps, estimated }
}
