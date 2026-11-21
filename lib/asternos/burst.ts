/**
 * AsterNOS burst building blocks (owner, 2026-11-20: plans are designed natively, lib/asternos/plan.ts).
 *
 * AsterNOS's CAR policer ("car tr-tcm") is VPP's 2R3C RFC 2698 policer (VPP src/plugins/policer): a committed bucket C
 * filling at CIR up to CBS and a peak bucket P filling at PIR up to PBS, in bytes; a packet over P is violate (red), over
 * C exceed (yellow), else conform (green); buckets are capped at 2^32-1 bytes. See docs/ASTERNOS-VPP.md.
 * - two-stage: a marker per client re-marks what passes the burst into class 1 and an HQoS user shapes the classes.
 * - single: one policer per client, exceed and violate dropped (fewer moving parts; drops instead of shaping).
 */

export type BurstDesign = "two-stage" | "single"
export const BURST_DESIGNS: BurstDesign[] = ["two-stage", "single"]

/** Peak bucket and HQoS burst sizes: ~1 MB as in Asterfusion's HQoS example ("to ensure smooth TCP performance"). */
export const SMALL_BUCKET = 1_000_000
/** VPP caps every bucket at 2^32-1 bytes (larger values are silently capped). */
export const MAX_BUCKET = 0xffffffff

/** CAR (traffic-behavior): cir/pir in kBps per the AsterNOS docs (1 kB = 1000 bytes assumed: to verify). */
export const carKBps = (mbps: number) => Math.round(mbps * 125)
/** HQoS and port-shaper: pir in byte/s. */
export const hqosBps = (mbps: number) => Math.round(mbps * 125_000)
