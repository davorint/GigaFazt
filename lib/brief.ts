"use client"

import { useSyncExternalStore } from "react"
import type { InternetTier } from "./business"

/**
 * /empresas project brief (owner, 2026-11-08): every "Cotizar proyecto" opens
 * a short 4-step brief that ends in WhatsApp with a structured summary, so the
 * first message already says what, where, how big and when. Nothing is sent
 * to or stored by us (the visitor sends the WhatsApp message themselves).
 *
 * Provider-less store, like lib/selection: buttons anywhere on the page call
 * `brief.open(preset)`, the page-level BriefHost lazy-loads the dialog.
 */
export const BRIEF_NEEDS = ["internet", "fiberLan", "cabling", "wifi", "equipment"] as const
export const BRIEF_SPACES = ["offices", "warehouses", "retail", "buildings"] as const
export const BRIEF_FLOORS = ["1", "2-3", "4-10", "10+"] as const
export const BRIEF_PEOPLE = ["1-10", "11-50", "51-200", "200+"] as const
export const BRIEF_WHEN = ["asap", "1-3m", "3m+", "exploring"] as const

export type BriefNeed = (typeof BRIEF_NEEDS)[number]
export type BriefSpace = (typeof BRIEF_SPACES)[number]
export type BriefTier = InternetTier["id"] | "unsure"

export interface BriefAnswers {
  needs: BriefNeed[]
  tier: BriefTier | null
  space: BriefSpace | null
  floors: (typeof BRIEF_FLOORS)[number] | null
  people: (typeof BRIEF_PEOPLE)[number] | null
  when: (typeof BRIEF_WHEN)[number] | null
  company: string
}

/** What the button that opened the brief already knows (a package, a space type, a service). */
export type BriefPreset = Partial<Pick<BriefAnswers, "needs" | "tier" | "space">>

export const EMPTY_BRIEF: BriefAnswers = { needs: [], tier: null, space: null, floors: null, people: null, when: null, company: "" }

export function briefFrom(preset?: BriefPreset): BriefAnswers {
  return { ...EMPTY_BRIEF, ...preset, needs: [...(preset?.needs ?? [])] }
}

/** Steps 0–2 must be answered before moving on; step 3 is the summary. */
export function briefStepComplete(step: number, a: BriefAnswers): boolean {
  if (step === 0) return a.needs.length > 0
  if (step === 1) return a.space !== null && a.floors !== null
  if (step === 2) return a.people !== null && a.when !== null
  return true
}

type State = { open: boolean; request: number; preset?: BriefPreset; context?: string }
const initial: State = { open: false, request: 0 }
let state = initial
const listeners = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function useBrief<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => selector(state),
    () => selector(initial)
  )
}

export const brief = {
  open: (preset?: BriefPreset, context?: string) => set({ open: true, request: state.request + 1, preset, context }),
  setOpen: (open: boolean) => set({ open }),
}
