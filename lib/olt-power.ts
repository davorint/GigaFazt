/**
 * Power for an OLT built on /olt: an AC power board (the rectifier is on the board) or an external AC → −48 V system
 * with batteries. The board and system figures are sourced (lib/olt-kb); the battery rules are typical planning values
 * the page labels as such: usable capacity 80 % of the rated Ah, charging current 0.1 C.
 *
 * Mexican mains: 127 V between phase and neutral falls in the rectifiers' derated range (85–175 V); 220 V between two
 * phases gives full power.
 */
import { AC_BOARDS, CHASSIS_INPUT_A, POWER_SYSTEMS, type PowerSystem } from "./olt-kb"

/** Nominal DC voltage for current (conservative: the system floats at −53.5 V, so the real current is lower). */
export const DC_V = 48
/** Typical lead-acid planning values (labeled on the page). */
export const BATTERY_USABLE = 0.8
export const CHARGE_RATE = 0.1

export type Mains = "127" | "220"

export type PowerPlanInput = {
  /** The build's maximum power, W. */
  loadW: number
  chassis: string
  /** Power boards fitted in the build. */
  boards: string[]
  system: string
  mains: Mains
  /** Hours on battery wanted when the mains fail (0 = none). */
  hours: number
  /** One rectifier more than the load needs, so one can fail. */
  spare: boolean
  /** Some boards have no published power: size with the chassis' maximum input current instead. */
  unknownBoards?: boolean
}

export type PowerIssue =
  | { code: "acOver"; board: string; ratedW: number }
  | { code: "noBoard" }
  | { code: "mixed" }
  | { code: "tooFewSlots"; need: number; slots: number }
  | { code: "outputSmall"; amps: number; outputA: number }
  | { code: "noBattery" }
  | { code: "lowMains" }
  | { code: "fromChassis"; amps: number }

export type PowerPlan = {
  /** "ac": an AC board feeds it; "dc": it needs −48 V from an external system; "none": no power board yet. */
  mode: "ac" | "dc" | "none"
  /** Load current at −48 V, A (the chassis maximum when some boards' power isn't published). */
  loadA: number
  /** loadA is the chassis' maximum input current, not the boards' sum. */
  fromChassis: boolean
  /** The chassis' maximum input current (Huawei), A. */
  chassisA: number | null
  /** AC board: its rated output, W. */
  acBoard?: { code: string; ratedW: number }
  system?: PowerSystem
  /** One rectifier at this mains voltage, A. */
  moduleA: number
  /** Battery Ah for the hours wanted (usable share). */
  batteryAh: number
  /** Charging current for that battery, A. */
  chargeA: number
  /** Rectifiers needed (load + charging, plus the spare when asked). */
  modules: number
  issues: PowerIssue[]
}

const round1 = (x: number) => Math.round(x * 10) / 10

export function powerPlan(i: PowerPlanInput): PowerPlan {
  const chassisA = CHASSIS_INPUT_A[i.chassis]?.v ?? null
  // Missing board figures would under-size the system: take the worst case Huawei gives for the chassis.
  const fromChassis = !!i.unknownBoards && chassisA !== null && chassisA > i.loadW / DC_V
  const loadA = fromChassis ? (chassisA as number) : Math.max(0, i.loadW) / DC_V
  const ac = i.boards.filter((b) => AC_BOARDS[b])
  const dc = i.boards.filter((b) => !AC_BOARDS[b])
  const issues: PowerIssue[] = fromChassis ? [{ code: "fromChassis", amps: chassisA as number }] : []
  const base = { loadA: round1(loadA), fromChassis, chassisA, moduleA: 0, batteryAh: 0, chargeA: 0, modules: 0 }
  if (!i.boards.length) return { ...base, mode: "none", issues: [{ code: "noBoard" }] }
  if (ac.length && dc.length) issues.push({ code: "mixed" })
  if (ac.length) {
    const code = ac[0]
    const ratedW = AC_BOARDS[code].v
    if (i.loadW > ratedW) issues.push({ code: "acOver", board: code, ratedW })
    // The AC board charges its own battery; size the battery the same way for the hours wanted.
    const batteryAh = i.hours > 0 ? Math.ceil((loadA * i.hours) / BATTERY_USABLE) : 0
    return { ...base, mode: "ac", acBoard: { code, ratedW }, batteryAh, chargeA: round1(batteryAh * CHARGE_RATE), issues }
  }
  const system = POWER_SYSTEMS.find((s) => s.id === i.system) ?? POWER_SYSTEMS[0]
  const moduleA = i.mains === "220" ? system.moduleA.high.v : system.moduleA.low.v
  const batteryAh = i.hours > 0 && system.hasBattery ? Math.ceil((loadA * i.hours) / BATTERY_USABLE) : 0
  const chargeA = batteryAh * CHARGE_RATE
  const modules = Math.max(1, Math.ceil((loadA + chargeA) / moduleA)) + (i.spare ? 1 : 0)
  if (modules > system.slots.v) issues.push({ code: "tooFewSlots", need: modules, slots: system.slots.v })
  if (loadA > system.maxOutputA.v) issues.push({ code: "outputSmall", amps: round1(loadA), outputA: system.maxOutputA.v })
  if (i.hours > 0 && !system.hasBattery) issues.push({ code: "noBattery" })
  if (i.mains === "127") issues.push({ code: "lowMains" })
  return { ...base, mode: "dc", system, moduleA, batteryAh, chargeA: round1(chargeA), modules, issues }
}

/** The external system as a shopping-list line, e.g. "1 × ETP4890-A2 + 2 × rectificador (30 A)". */
export function powerBill(p: PowerPlan): string | null {
  if (p.mode !== "dc" || !p.system) return null
  return `1 × ${p.system.id} + ${p.modules} × rectificador (${p.moduleA} A)${p.batteryAh ? ` + baterías 48 V de ${p.batteryAh} Ah` : ""}`
}
