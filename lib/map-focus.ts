"use client"

/**
 * Cross-island request to locate something on the coverage map. The map is a
 * lazy island, so a request made before it has loaded is kept as `pending`
 * and consumed on load instead of being lost.
 */
export type MapFocusTarget = { kind: "client" | "state"; id: string }

const EVENT = "map:focus"
let pending: MapFocusTarget | null = null

export function requestMapFocus(target: MapFocusTarget) {
  pending = target
  window.dispatchEvent(new CustomEvent<MapFocusTarget>(EVENT, { detail: target }))
}

/** Take (and clear) a request made before the map was ready. */
export function takePendingMapFocus(): MapFocusTarget | null {
  const p = pending
  pending = null
  return p
}

export function onMapFocus(cb: (t: MapFocusTarget) => void): () => void {
  const handler = (e: Event) => {
    pending = null
    cb((e as CustomEvent<MapFocusTarget>).detail)
  }
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
