/**
 * /empresas interactive floor (owner, 2026-11-08: "take it to the next
 * level"): example floor plans for the four spaces we connect, with what a
 * fiber network reaches on them. Illustrative layouts (captioned as such),
 * not a design or a quote. Coordinates are in a 1000 × 600 plan.
 *
 * Every element is cabled from the network closet: the run goes from the
 * closet to the plan's corridor, along it, then to the element
 * (`fiberRun`), so runs read like real cable paths, not straight lines.
 */
import type { BriefSpace } from "./brief"

export const PLAN_W = 1000
export const PLAN_H = 600

export const SEGMENTS = ["admin", "cameras", "guests", "production"] as const
export type Segment = (typeof SEGMENTS)[number]

export const ELEMENT_KINDS = ["closet", "ap", "camera", "access", "screen", "desk", "phone", "storage"] as const
export type ElementKind = (typeof ELEMENT_KINDS)[number]

export type Room = { id: string; x: number; y: number; w: number; h: number; n?: number }
export type FloorElement = { id: string; kind: Exclude<ElementKind, "closet">; x: number; y: number; room: string; seg: Segment }
export type FloorPlan = {
  space: BriefSpace
  rooms: Room[]
  /** The corridor the runs follow (a y coordinate between room rows). */
  corridorY: number
  closet: { x: number; y: number; room: string }
  elements: FloorElement[]
}

export const FLOORS: Record<BriefSpace, FloorPlan> = {
  offices: {
    space: "offices",
    corridorY: 285,
    rooms: [
      { id: "reception", x: 40, y: 40, w: 260, h: 200 },
      { id: "meeting", x: 300, y: 40, w: 300, h: 200 },
      { id: "direction", x: 600, y: 40, w: 360, h: 200 },
      { id: "work", x: 40, y: 330, w: 620, h: 230 },
      { id: "site", x: 660, y: 330, w: 140, h: 230 },
      { id: "kitchen", x: 800, y: 330, w: 160, h: 230 },
    ],
    closet: { x: 730, y: 390, room: "site" },
    elements: [
      { id: "o-cam1", kind: "camera", x: 70, y: 70, room: "reception", seg: "cameras" },
      { id: "o-acc", kind: "access", x: 70, y: 165, room: "reception", seg: "cameras" },
      { id: "o-ap1", kind: "ap", x: 170, y: 130, room: "reception", seg: "guests" },
      { id: "o-scr1", kind: "screen", x: 450, y: 75, room: "meeting", seg: "admin" },
      { id: "o-ap2", kind: "ap", x: 450, y: 180, room: "meeting", seg: "guests" },
      { id: "o-desk1", kind: "desk", x: 720, y: 130, room: "direction", seg: "admin" },
      { id: "o-ph1", kind: "phone", x: 860, y: 130, room: "direction", seg: "admin" },
      { id: "o-desk2", kind: "desk", x: 120, y: 400, room: "work", seg: "admin" },
      { id: "o-desk3", kind: "desk", x: 260, y: 400, room: "work", seg: "admin" },
      { id: "o-desk4", kind: "desk", x: 400, y: 400, room: "work", seg: "admin" },
      { id: "o-desk5", kind: "desk", x: 540, y: 400, room: "work", seg: "admin" },
      { id: "o-ap3", kind: "ap", x: 330, y: 510, room: "work", seg: "guests" },
      { id: "o-ph2", kind: "phone", x: 190, y: 480, room: "work", seg: "admin" },
      { id: "o-sto", kind: "storage", x: 730, y: 500, room: "site", seg: "production" },
      { id: "o-cam2", kind: "camera", x: 930, y: 530, room: "kitchen", seg: "cameras" },
    ],
  },
  warehouses: {
    space: "warehouses",
    corridorY: 250,
    rooms: [
      { id: "office", x: 40, y: 40, w: 280, h: 180 },
      { id: "site", x: 320, y: 40, w: 120, h: 180 },
      { id: "docks", x: 440, y: 40, w: 520, h: 180 },
      { id: "storage", x: 40, y: 280, w: 920, h: 280 },
    ],
    closet: { x: 380, y: 100, room: "site" },
    elements: [
      { id: "w-desk1", kind: "desk", x: 110, y: 110, room: "office", seg: "admin" },
      { id: "w-desk2", kind: "desk", x: 240, y: 110, room: "office", seg: "admin" },
      { id: "w-ph", kind: "phone", x: 180, y: 185, room: "office", seg: "admin" },
      { id: "w-sto", kind: "storage", x: 380, y: 160, room: "site", seg: "production" },
      { id: "w-cam1", kind: "camera", x: 490, y: 70, room: "docks", seg: "cameras" },
      { id: "w-cam2", kind: "camera", x: 930, y: 70, room: "docks", seg: "cameras" },
      { id: "w-acc", kind: "access", x: 700, y: 190, room: "docks", seg: "cameras" },
      { id: "w-scr", kind: "screen", x: 700, y: 90, room: "docks", seg: "production" },
      { id: "w-ap1", kind: "ap", x: 200, y: 420, room: "storage", seg: "production" },
      { id: "w-ap2", kind: "ap", x: 500, y: 420, room: "storage", seg: "production" },
      { id: "w-ap3", kind: "ap", x: 800, y: 420, room: "storage", seg: "production" },
      { id: "w-cam3", kind: "camera", x: 70, y: 310, room: "storage", seg: "cameras" },
      { id: "w-cam4", kind: "camera", x: 930, y: 530, room: "storage", seg: "cameras" },
    ],
  },
  retail: {
    space: "retail",
    corridorY: 360,
    rooms: [
      { id: "hall", x: 40, y: 40, w: 560, h: 280 },
      { id: "terrace", x: 600, y: 40, w: 360, h: 280 },
      { id: "cashier", x: 40, y: 400, w: 200, h: 160 },
      { id: "kitchen", x: 240, y: 400, w: 360, h: 160 },
      { id: "site", x: 600, y: 400, w: 160, h: 160 },
      { id: "bathrooms", x: 760, y: 400, w: 200, h: 160 },
    ],
    closet: { x: 680, y: 450, room: "site" },
    elements: [
      { id: "r-cam1", kind: "camera", x: 70, y: 70, room: "hall", seg: "cameras" },
      { id: "r-ap1", kind: "ap", x: 220, y: 180, room: "hall", seg: "guests" },
      { id: "r-ap2", kind: "ap", x: 450, y: 180, room: "hall", seg: "guests" },
      { id: "r-scr1", kind: "screen", x: 560, y: 80, room: "hall", seg: "admin" },
      { id: "r-ap3", kind: "ap", x: 780, y: 180, room: "terrace", seg: "guests" },
      { id: "r-cam2", kind: "camera", x: 930, y: 70, room: "terrace", seg: "cameras" },
      { id: "r-desk", kind: "desk", x: 120, y: 460, room: "cashier", seg: "admin" },
      { id: "r-ph", kind: "phone", x: 200, y: 530, room: "cashier", seg: "admin" },
      { id: "r-cam3", kind: "camera", x: 70, y: 430, room: "cashier", seg: "cameras" },
      { id: "r-scr2", kind: "screen", x: 420, y: 460, room: "kitchen", seg: "production" },
      { id: "r-sto", kind: "storage", x: 680, y: 525, room: "site", seg: "production" },
      { id: "r-acc", kind: "access", x: 930, y: 530, room: "bathrooms", seg: "cameras" },
    ],
  },
  buildings: {
    space: "buildings",
    corridorY: 300,
    rooms: [
      { id: "unit", n: 1, x: 40, y: 40, w: 230, h: 220 },
      { id: "unit", n: 2, x: 270, y: 40, w: 230, h: 220 },
      { id: "unit", n: 3, x: 500, y: 40, w: 230, h: 220 },
      { id: "unit", n: 4, x: 730, y: 40, w: 230, h: 220 },
      { id: "lobby", x: 40, y: 340, w: 400, h: 220 },
      { id: "site", x: 440, y: 340, w: 140, h: 220 },
      { id: "admin", x: 580, y: 340, w: 380, h: 220 },
    ],
    closet: { x: 510, y: 400, room: "site" },
    elements: [
      { id: "b-ap1", kind: "ap", x: 155, y: 150, room: "unit-1", seg: "production" },
      { id: "b-ap2", kind: "ap", x: 385, y: 150, room: "unit-2", seg: "production" },
      { id: "b-ap3", kind: "ap", x: 615, y: 150, room: "unit-3", seg: "production" },
      { id: "b-ap4", kind: "ap", x: 845, y: 150, room: "unit-4", seg: "production" },
      { id: "b-scr", kind: "screen", x: 240, y: 380, room: "lobby", seg: "admin" },
      { id: "b-ap5", kind: "ap", x: 240, y: 490, room: "lobby", seg: "guests" },
      { id: "b-acc", kind: "access", x: 70, y: 450, room: "lobby", seg: "cameras" },
      { id: "b-cam1", kind: "camera", x: 70, y: 370, room: "lobby", seg: "cameras" },
      { id: "b-sto", kind: "storage", x: 510, y: 520, room: "site", seg: "production" },
      { id: "b-desk", kind: "desk", x: 680, y: 450, room: "admin", seg: "admin" },
      { id: "b-ph", kind: "phone", x: 860, y: 450, room: "admin", seg: "admin" },
      { id: "b-cam2", kind: "camera", x: 930, y: 530, room: "admin", seg: "cameras" },
    ],
  },
}

/** Room key for messages: "unit-2" style ids carry their number. */
export function roomKey(room: string): { id: string; n?: number } {
  const m = /^(.*)-(\d+)$/.exec(room)
  return m ? { id: m[1], n: Number(m[2]) } : { id: room }
}

/** Orthogonal cable path closet → corridor → element (SVG path data). */
export function fiberRun(plan: FloorPlan, el: { x: number; y: number }): string {
  const { x: cx, y: cy } = plan.closet
  const c = plan.corridorY
  return `M${cx} ${cy} V${c} H${el.x} V${el.y}`
}

/** Count of each element kind on a plan (closet excluded). */
export function kindCounts(plan: FloorPlan): Partial<Record<ElementKind, number>> {
  const out: Partial<Record<ElementKind, number>> = {}
  for (const e of plan.elements) out[e.kind] = (out[e.kind] ?? 0) + 1
  return out
}
