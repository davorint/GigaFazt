/**
 * "Arma tu OLT" on /olt: a chassis, a board per slot, and what that adds up to (ports, ONTs, power) with the checks a
 * buyer needs (control-board compatibility, minimum software, end-of-life boards, redundancy). Slot numbers come from
 * the same Huawei documents as lib/olt-kb.ts; the numbers here repeat the ones in its sourced text (a test checks they
 * match) so the totals can be computed.
 */
import { BOARDS, CHASSIS, type Board, type Family } from "./olt-kb"

export type SlotRole = "service" | "control" | "uplink" | "power"
export type Layout = { service: number[]; control: number[]; uplink: number[]; power: number[]; /** Fan tray max W, when published. */ fanW?: number }

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k)

export const LAYOUTS: Record<string, Layout> = {
  ma5608t: { service: [0, 1], control: [2, 3], uplink: [], power: [4], fanW: 39 },
  ma5603t: { service: range(0, 5), control: [6, 7], uplink: [8, 9], power: [10, 11], fanW: 72 },
  "ma5600t-etsi": { service: [...range(1, 8), ...range(11, 18)], control: [9, 10], uplink: [19, 20], power: [21, 22], fanW: 67 },
  "ma5600t-iec": { service: [...range(1, 6), ...range(9, 16)], control: [7, 8], uplink: [17, 18], power: [19, 20], fanW: 88 },
  "ma5800-x2": { service: [1, 2], control: [3, 4], uplink: [], power: [0] },
  "ma5800-x7": { service: range(1, 7), control: [8, 9], uplink: [], power: [10, 11] },
  "ma5800-x15": { service: [...range(1, 7), ...range(10, 17)], control: [8, 9], uplink: [], power: [18, 19] },
  "ma5800-x17": { service: [...range(1, 8), ...range(11, 19)], control: [9, 10], uplink: [], power: [20, 21] },
}

export type PonTech = "gpon" | "xgpon" | "xgspon" | "comboXg" | "comboXgs" | "flex"
/** Static / max W and PON ports per board, repeating the sourced values in olt-kb (null = not published). */
export const BOARD_NUMBERS: Record<string, { s?: number; m?: number; pon?: { ports: number; tech: PonTech; onts?: number } }> = {
  H801SCUN: { s: 41, m: 62 },
  H802SCUN: { s: 30, m: 50 },
  H801SCUH: { s: 89, m: 134 },
  H801SCUV: { s: 89, m: 134 },
  H801SCUL: { s: 40.4, m: 42.1 },
  H801SCUB: { s: 18.8, m: 22 },
  H801SCUF: { s: 22, m: 25 },
  H801MCUD: { s: 24, m: 26 },
  H801MCUD1: { s: 29, m: 33 },
  H801MCUE: { s: 24, m: 26 },
  H801GPBC: { s: 70.6, m: 78, pon: { ports: 4, tech: "gpon", onts: 64 } },
  H802GPBD: { s: 45, m: 51, pon: { ports: 8, tech: "gpon", onts: 128 } },
  H805GPBD: { s: 43, m: 49, pon: { ports: 8, tech: "gpon", onts: 128 } },
  H806GPBH: { s: 32, m: 46, pon: { ports: 8, tech: "gpon", onts: 128 } },
  H802GPFD: { s: 45, m: 73, pon: { ports: 16, tech: "gpon", onts: 128 } },
  H805GPFD: { s: 26, m: 50, pon: { ports: 16, tech: "gpon" } },
  H803GPFD: { s: 39, m: 61, pon: { ports: 16, tech: "gpon" } },
  H807GPBD: { s: 25, m: 38, pon: { ports: 8, tech: "gpon" } },
  H801GPMD: { s: 32, m: 46, pon: { ports: 8, tech: "gpon", onts: 128 } },
  H802XGBC: { s: 67, m: 85, pon: { ports: 4, tech: "xgpon" } },
  H801XGBD: { pon: { ports: 8, tech: "xgpon" } },
  H801X2CS: { s: 17.6, m: 18 },
  H801X2CA: { s: 20.2, m: 20.5 },
  H801X1CA: { s: 11.1, m: 11.3 },
  H801GICF: { s: 3.9, m: 3.9 },
  H801GICG: { s: 6.3, m: 9.2 },
  H801GICK: { s: 6.6, m: 7 },
  H801GICD: { s: 5.3, m: 5.3 },
  H801GICE: { s: 5.8, m: 11.8 },
  H801GSCA: { s: 8, m: 10 },
  H802P2CA: { s: 9, m: 10 },
  H801ETHA: { s: 19.6, m: 27 },
  H801OPFA: { s: 20.2, m: 28.5 },
  H802OPGD: { s: 70, m: 100 },
  H801ETHB: { s: 20, m: 21 },
  H802OPGE: { s: 53, m: 90 },
  H801PRTE: { s: 1.5, m: 1.5 },
  H801PRTG: { m: 0.2 },
  H801PRTA: { s: 1.5, m: 1.5 },
  H801MPWC: { s: 2.5, m: 2.5 },
  H801MPWD: { s: 2 },
  H901PILA: { s: 0.5, m: 4 },
  H901GPHF: { s: 25, m: 50, pon: { ports: 16, tech: "gpon" } },
  H901XGHD: { s: 42, m: 61, pon: { ports: 8, tech: "xgpon" } },
  H901XSHF: { pon: { ports: 16, tech: "xgspon" } },
  H901GPSF: { pon: { ports: 16, tech: "gpon" } },
  H901GPUF: { pon: { ports: 16, tech: "gpon" } },
  H901GPLF: { pon: { ports: 16, tech: "gpon" } },
  H901XGSF: { pon: { ports: 16, tech: "xgpon" } },
  H902XSHD: { pon: { ports: 8, tech: "xgspon" } },
  H902CGHD: { pon: { ports: 8, tech: "comboXg" } },
  H902CSHD: { pon: { ports: 8, tech: "comboXgs" } },
  H901CGHF: { s: 48, m: 106, pon: { ports: 16, tech: "comboXg" } },
  H901CSHF: { pon: { ports: 16, tech: "comboXgs" } },
  H901FLHF: { pon: { ports: 16, tech: "flex" } },
}

/** Which boards a slot of this role takes in this chassis. */
export function boardsFor(chassisId: string, role: SlotRole): Board[] {
  const family: Family | undefined = CHASSIS.find((c) => c.id === chassisId)?.family
  return BOARDS.filter((b) => b.chassis.includes(chassisId)).filter((b) => {
    if (role === "control") return b.kind === "control"
    if (role === "power") return b.kind === "power"
    if (role === "uplink") return b.kind === "uplink"
    // Service slots: PON and Ethernet boards; on the MA5800 the uplink boards go in service slots too.
    return b.kind === "gpon" || b.kind === "tenG" || b.kind === "combo" || b.kind === "ethernet" || (family === "ma5800" && b.kind === "uplink")
  })
}

export type Build = { chassis: string; slots: Record<number, string> }

export type BuildIssue =
  | { code: "noControl" }
  | { code: "oneControl" }
  | { code: "mixedControl"; boards: string[] }
  | { code: "noPower" }
  | { code: "onePower" }
  | { code: "notWithControl"; board: string; control: string }
  | { code: "endOfLife"; board: string; status: string; replacedBy: string[] }
  | { code: "noPowerData"; boards: string[] }
  | { code: "noOntData" }

export type BuildSummary = {
  roleOf: Record<number, SlotRole>
  /** Boards in the build, with counts, in slot order. */
  bill: { code: string; count: number }[]
  ports: Partial<Record<PonTech, number>>
  /** ONTs the GPON boards take at their published maximum per port (boards without the figure are left out). */
  onts: number
  minVersion: string | null
  staticW: number
  maxW: number
  /** Max current at −48 V DC, A. */
  amps48: number
  issues: BuildIssue[]
}

/** Control boards' short name as Huawei's compatibility tables use it (H802SCUN → SCUN, H801MCUD1 → MCUD1). */
const shortControl = (code: string) => code.replace(/^H\d{3}/, "")

export function summarize(b: Build): BuildSummary {
  const layout = LAYOUTS[b.chassis]
  const roleOf: Record<number, SlotRole> = {}
  for (const role of ["service", "control", "uplink", "power"] as const) for (const s of layout?.[role] ?? []) roleOf[s] = role
  const placed = Object.entries(b.slots)
    .map(([slot, code]) => ({ slot: Number(slot), board: BOARDS.find((x) => x.code === code) }))
    .filter((p): p is { slot: number; board: Board } => !!p.board && roleOf[p.slot] !== undefined && p.board.chassis.includes(b.chassis))
    .sort((a, c) => a.slot - c.slot)
  const issues: BuildIssue[] = []
  const controls = placed.filter((p) => roleOf[p.slot] === "control").map((p) => p.board)
  const powers = placed.filter((p) => roleOf[p.slot] === "power").map((p) => p.board)
  if (controls.length === 0) issues.push({ code: "noControl" })
  else if (controls.length === 1 && (layout?.control.length ?? 0) > 1) issues.push({ code: "oneControl" })
  if (new Set(controls.map((c) => c.code)).size > 1) issues.push({ code: "mixedControl", boards: [...new Set(controls.map((c) => c.code))] })
  if (powers.length === 0) issues.push({ code: "noPower" })
  else if (powers.length === 1 && (layout?.power.length ?? 0) > 1) issues.push({ code: "onePower" })
  // Every board with a compatibility list must work with each control board fitted.
  for (const { board } of placed) {
    if (!board.controls) continue
    for (const c of controls) {
      const short = shortControl(c.code)
      if (!board.controls.v.some((x) => x === short || x.startsWith(`${short} `))) issues.push({ code: "notWithControl", board: board.code, control: c.code })
    }
  }
  const seen = new Set<string>()
  for (const { board } of placed) {
    if (board.lifecycle && !seen.has(board.code)) issues.push({ code: "endOfLife", board: board.code, status: board.lifecycle.v, replacedBy: board.replacedBy?.v ?? [] })
    seen.add(board.code)
  }
  const ports: Partial<Record<PonTech, number>> = {}
  let onts = 0
  let missingOnts = false
  let staticW = 0
  let maxW = layout?.fanW ?? 0
  const noData = new Set<string>()
  for (const { board } of placed) {
    const n = BOARD_NUMBERS[board.code]
    if (n?.pon) {
      ports[n.pon.tech] = (ports[n.pon.tech] ?? 0) + n.pon.ports
      if (n.pon.tech === "gpon") {
        if (n.pon.onts) onts += n.pon.ports * n.pon.onts
        else missingOnts = true
      }
    }
    if (n?.m === undefined && n?.s === undefined) noData.add(board.code)
    staticW += n?.s ?? 0
    maxW += n?.m ?? n?.s ?? 0
  }
  if (noData.size) issues.push({ code: "noPowerData", boards: [...noData] })
  if (missingOnts) issues.push({ code: "noOntData" })
  const versions = placed.map((p) => p.board.minVersion?.v).filter((v): v is string => !!v)
  // Same scheme per family (V800R0xxCxx / V100R0xxCxx): the highest one wins.
  const chassisMin = CHASSIS.find((c) => c.id === b.chassis)?.minSoftware?.v
  const all = [...versions, ...(chassisMin ? [chassisMin] : [])].sort()
  const bill = new Map<string, number>()
  for (const { board } of placed) bill.set(board.code, (bill.get(board.code) ?? 0) + 1)
  return {
    roleOf,
    bill: [...bill].map(([code, count]) => ({ code, count })),
    ports,
    onts,
    minVersion: all.at(-1) ?? null,
    staticW: Math.round(staticW * 10) / 10,
    maxW: Math.round(maxW * 10) / 10,
    amps48: Math.round((maxW / 48) * 10) / 10,
    issues,
  }
}

// ── Share link: #olt=<chassis>;<slot>:<code>,… ────────────────────────────────
export function encodeBuild(b: Build): string {
  const slots = Object.entries(b.slots)
    .filter(([, code]) => code)
    .map(([s, code]) => `${s}:${code}`)
    .join(",")
  return `${b.chassis};${slots}`
}

export function decodeBuild(text: string): Build | null {
  const [chassis, slots = ""] = text.split(";")
  if (!LAYOUTS[chassis]) return null
  const out: Record<number, string> = {}
  for (const pair of slots.split(",").filter(Boolean)) {
    const [s, code] = pair.split(":")
    const n = Number(s)
    if (Number.isInteger(n) && BOARDS.some((x) => x.code === code && x.chassis.includes(chassis))) out[n] = code
  }
  return { chassis, slots: out }
}

/** A sensible starting point for each chassis: two control boards, power, one PON board. */
export function starter(chassisId: string): Build {
  const presets: Record<string, Record<number, string>> = {
    ma5608t: { 0: "H802GPFD", 2: "H801MCUD1", 3: "H801MCUD1", 4: "H801MPWD" },
    ma5603t: { 0: "H802GPFD", 6: "H802SCUN", 7: "H802SCUN", 8: "H801X2CS", 10: "H801PRTE", 11: "H801PRTE" },
    "ma5600t-etsi": { 1: "H802GPFD", 9: "H802SCUN", 10: "H802SCUN", 19: "H801X2CS", 21: "H801PRTE", 22: "H801PRTE" },
    "ma5600t-iec": { 1: "H802GPFD", 7: "H802SCUN", 8: "H802SCUN", 17: "H801X2CS", 19: "H801PRTE", 20: "H801PRTE" },
    "ma5800-x2": { 1: "H901CSHF", 3: "H901MPSA", 4: "H901MPSA", 0: "H901PISB" },
    "ma5800-x7": { 1: "H901CSHF", 8: "H901MPLB", 9: "H901MPLB", 10: "H901PILA", 11: "H901PILA" },
    "ma5800-x15": { 1: "H901CSHF", 8: "H901MPLB", 9: "H901MPLB", 18: "H901PILA", 19: "H901PILA" },
    "ma5800-x17": { 1: "H901CSHF", 9: "H901MPLB", 10: "H901MPLB", 20: "H901PILA", 21: "H901PILA" },
  }
  return { chassis: chassisId, slots: { ...(presets[chassisId] ?? {}) } }
}

// ── Link with the deployments of /mikrotik ──────────────────────────────────

/** The deployments' OLT models (lib/mikrotik/olt.ts) and the chassis here. The MA5683T is the MA5603T frame (resellers). */
export const MODEL_CHASSIS: Record<string, string> = {
  ma5608t: "ma5608t",
  ma5683t: "ma5603t",
  ma5800x2: "ma5800-x2",
  ma5800x7: "ma5800-x7",
  ma5800x15: "ma5800-x15",
  ma5800x17: "ma5800-x17",
}
/** The other way; the MA5600T frames have no model of their own on /mikrotik ("other"). */
export const chassisModel = (chassisId: string) => Object.entries(MODEL_CHASSIS).find(([, c]) => c === chassisId)?.[0] ?? "other"

export type DeployPon = "gpon" | "xgpon" | "xgspon"

/** PON ports a build gives each kind of ONT: a combo port serves GPON and its 10G type, a Flex-PON port any (with its module). */
export function buildPorts(ports: Partial<Record<PonTech, number>>): Record<DeployPon, number> {
  const n = (k: PonTech) => ports[k] ?? 0
  return {
    gpon: n("gpon") + n("comboXg") + n("comboXgs") + n("flex"),
    xgpon: n("xgpon") + n("comboXg") + n("flex"),
    xgspon: n("xgspon") + n("comboXgs") + n("flex"),
  }
}

/**
 * The board used to fill a deployment's ports. MA5600T family: GPFD for GPON, XGBC for XG-PON (no XGS-PON boards).
 * MA5800: the XGS-PON combo CSHF for GPON too (GPON ONTs today, XGS-PON later without changing them), CGHF for XG-PON.
 */
const FILL: Record<Family, Partial<Record<DeployPon, string>>> = {
  ma5600: { gpon: "H802GPFD", xgpon: "H802XGBC" },
  ma5800: { gpon: "H901CSHF", xgpon: "H901CGHF", xgspon: "H901CSHF" },
}

export type Suggestion = { build: Build; board: string | null; boards: number; ports: number; fits: boolean }

/** The chassis' example with its service slots filled with enough boards for `need` ports of `pon`. */
export function suggestFor(chassisId: string, pon: DeployPon, need: number): Suggestion {
  const base = starter(chassisId)
  const layout = LAYOUTS[chassisId]
  const family = CHASSIS.find((c) => c.id === chassisId)?.family
  const board = family ? (FILL[family][pon] ?? null) : null
  const service = new Set(layout?.service ?? [])
  const slots = Object.fromEntries(Object.entries(base.slots).filter(([s]) => !service.has(Number(s))))
  const per = board ? (BOARD_NUMBERS[board]?.pon?.ports ?? 0) : 0
  const wanted = per > 0 ? Math.max(1, Math.ceil(Math.max(0, need) / per)) : 0
  const boards = Math.min(wanted, layout?.service.length ?? 0)
  for (const s of (layout?.service ?? []).slice(0, boards)) slots[s] = board as string
  return { build: { chassis: chassisId, slots }, board, boards, ports: boards * per, fits: per > 0 && boards * per >= need }
}
