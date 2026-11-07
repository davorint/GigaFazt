"use client"

import { useSyncExternalStore } from "react"
import { featuredPlan } from "./plans"

/**
 * Tiny cross-island store (no provider, no deps): the selected plan, toggled
 * add-ons and the lead Sheet request. Client islands share it via
 * useSyncExternalStore; the server snapshot is the static default.
 */
export interface SelectionState {
  planId: string
  addOnIds: string[]
  /** Increments each time a CTA asks for the lead Sheet; 0 = never opened. */
  leadRequest: number
  leadOpen: boolean
}

const initial: SelectionState = {
  planId: featuredPlan.id,
  addOnIds: [],
  leadRequest: 0,
  leadOpen: false,
}

let state = initial
const listeners = new Set<() => void>()

function set(patch: Partial<SelectionState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useSelection<T>(selector: (s: SelectionState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(initial)
  )
}

export const selection = {
  selectPlan: (planId: string) => set({ planId }),
  toggleAddOn: (id: string, on: boolean) =>
    set({
      addOnIds: on
        ? [...new Set([...state.addOnIds, id])]
        : state.addOnIds.filter((a) => a !== id),
    }),
  setAddOns: (addOnIds: string[]) => set({ addOnIds }),
  openLead: (planId?: string) =>
    set({
      planId: planId ?? state.planId,
      leadRequest: state.leadRequest + 1,
      leadOpen: true,
    }),
  setLeadOpen: (leadOpen: boolean) => set({ leadOpen }),
}
