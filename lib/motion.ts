"use client"

import { useSyncExternalStore } from "react"
import { MOTION_KEY } from "./motion-init"

/**
 * Effective motion preference: the OS `prefers-reduced-motion` setting OR the
 * on-page "pause animations" toggle (WCAG 2.2.2 Pause, Stop, Hide). The toggle
 * persists in localStorage and is mirrored on `<html data-motion="off">`, which
 * globals.css treats like reduced motion. An inline script in the layout applies
 * the stored choice before first paint.
 */
const QUERY = "(prefers-reduced-motion: reduce)"
const EVENT = "motionchange"

export function systemReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(QUERY).matches
}

export function motionPausedByUser(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.motion === "off"
}

/** True when animations should not run (OS preference or user pause). */
export function motionReduced(): boolean {
  return systemReducedMotion() || motionPausedByUser()
}

export function setMotionPaused(paused: boolean) {
  const root = document.documentElement
  if (paused) root.dataset.motion = "off"
  else delete root.dataset.motion
  try {
    if (paused) localStorage.setItem(MOTION_KEY, "off")
    else localStorage.removeItem(MOTION_KEY)
  } catch {
    // Storage blocked (private mode): the choice still applies to this page.
  }
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener("change", cb)
  window.addEventListener(EVENT, cb)
  return () => {
    mq.removeEventListener("change", cb)
    window.removeEventListener(EVENT, cb)
  }
}

/** Server snapshot is `true` so SSR / first paint is the static frame. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionReduced, () => true)
}

export function useMotionState(): { reduced: boolean; system: boolean } {
  const reduced = useReducedMotion()
  const system = useSyncExternalStore(subscribeMotion, systemReducedMotion, () => false)
  return { reduced, system }
}
