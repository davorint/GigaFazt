/**
 * The guide's recommendations for one deployment, from its own numbers: internet capacity, the burst rule,
 * the router model and day-to-day operations. Thresholds are rules of thumb (stated on the page), not vendor figures.
 */
import { usableSpeed } from "./balance"
import { summarize } from "./deployments"
import type { DeploymentFields } from "./state"

export type AdviceLevel = "ok" | "warn" | "bad"

/** Busy-hour average over what the links carry: above this, bursts fill the links at times; above the second, often. */
export const LOAD_WARN = 0.5
export const LOAD_BAD = 0.75
/** Sustained share of the plan below which the burst rule is flagged (the owner always uses burst). */
export const SUSTAIN_WARN = 0.5
/** Clients from which a CCR2004 runs short (with FastTrack off: ~800 PPPoE with queues reported at 100 % CPU). */
export const CCR2004_MAX = 300
export const CCR2116_FROM = 600
/** Busy-hour traffic from which a CCR2004 isn't enough (~1.5 Gbps PPPoE + NAT + queues). */
export const CCR2004_MBPS = 1500

export type Advice = {
  capacity: { level: AdviceLevel; demandMbps: number; internetMbps: number; load: number; measured: boolean; topPlanMbps: number; biggestLinkMbps: number; planOverLink: boolean; links: number | null }
  burst: { level: AdviceLevel; sustainedPct: number; topPlanMbps: number; sustainedMbps: number }
  router: { level: AdviceLevel; clients: number; demandMbps: number; model: "ccr2004" | "ccr2116" }
  ops: { level: AdviceLevel; alerts: boolean; backupOff: boolean; snmp: boolean }
  /** Links without a public IP on the MikroTik (the provider's modem or CGNAT translates again). */
  exit: { level: AdviceLevel; natLinks: string[]; total: number }
}

export function adviceFor(f: DeploymentFields): Advice {
  const sum = summarize(f)
  const load = sum.internetMbps > 0 ? sum.offeredMbps / sum.internetMbps : Infinity
  const topPlanMbps = Math.max(0, ...f.setup.plans.map((p) => Math.max(p.down, p.up)))
  // Balanced per client (src-address / both-addresses), one client never gets more than one link.
  const perClient = f.capacity.internet === "links" && f.balance.classifier !== "both-addresses-and-ports"
  const biggestLinkMbps = f.capacity.internet === "links" ? Math.max(0, ...f.wans.map((w) => usableSpeed(w, "down", f.balance.queues))) : f.capacity.parentMbps
  const planOverLink = perClient && f.wans.length > 1 && topPlanMbps > biggestLinkMbps
  const capLevel: AdviceLevel = load >= LOAD_BAD ? "bad" : load >= LOAD_WARN || planOverLink ? "warn" : "ok"

  const sustained = f.setup.rule.sustained
  const routerModel = sum.clients >= CCR2004_MAX || sum.offeredMbps >= CCR2004_MBPS ? "ccr2116" : "ccr2004"
  const alerts = f.setup.alert !== "none"
  const backupOff = f.setup.backup === "none" || f.setup.backup === "local"
  return {
    capacity: {
      level: capLevel,
      demandMbps: sum.offeredMbps,
      internetMbps: sum.internetMbps,
      load,
      measured: sum.measured,
      topPlanMbps,
      biggestLinkMbps,
      planOverLink,
      links: sum.links,
    },
    burst: { level: sustained < SUSTAIN_WARN ? "warn" : "ok", sustainedPct: Math.round(sustained * 100), topPlanMbps, sustainedMbps: topPlanMbps * sustained },
    router: { level: sum.clients >= CCR2116_FROM ? "bad" : routerModel === "ccr2116" ? "warn" : "ok", clients: sum.clients, demandMbps: sum.offeredMbps, model: routerModel },
    ops: { level: alerts && !backupOff && f.setup.snmp ? "ok" : "warn", alerts, backupOff, snmp: f.setup.snmp },
    exit: (() => {
      const natLinks = f.wans.filter((w) => w.providerNat).map((w) => w.name)
      // All behind the provider's NAT: every client shares its per-subscriber limits; some: only those links.
      const level: AdviceLevel = natLinks.length === 0 ? "ok" : natLinks.length === f.wans.length ? "bad" : "warn"
      return { level, natLinks, total: f.wans.length }
    })(),
  }
}
