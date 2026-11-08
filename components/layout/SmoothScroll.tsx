"use client"

import { useEffect } from "react"
import { motionReduced, subscribeMotion } from "@/lib/motion"
import { setScroller } from "@/lib/scroll"

/**
 * Inertial wheel scrolling (owner, 2026-11-08: "premium" review point 8) with
 * Lenis. Loaded after the page is idle (not in the first-load JS budget),
 * only for fine pointers (touch keeps native scrolling) and only while motion
 * is allowed: it stops when the visitor reduces motion or pauses animations.
 * Dialogs: autoToggle pauses it while a dialog locks the page; scrollable
 * areas (dialogs, the sheet, wide tables) keep their own scroll.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return
    let lenis: { destroy: () => void } | null = null
    let alive = true
    let idle = 0

    const start = async () => {
      if (lenis || motionReduced()) return
      const { default: Lenis } = await import("lenis")
      if (!alive || lenis || motionReduced()) return
      const l = new Lenis({
        autoRaf: true,
        autoToggle: true,
        allowNestedScroll: true,
        lerp: 0.075, // a touch heavier than the default 0.1: slower settle, more weight
        anchors: { offset: -80 },
        prevent: (node) => node.closest?.('[role="dialog"], [data-lenis-prevent]') != null,
      })
      lenis = l
      setScroller(l)
    }
    const stop = () => {
      lenis?.destroy()
      lenis = null
      setScroller(null)
    }
    const sync = () => (motionReduced() ? stop() : void start())

    const schedule = () => {
      const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200))
      idle = ric(() => void start()) as number
    }
    if (document.readyState === "complete") schedule()
    else window.addEventListener("load", schedule, { once: true })
    const unsub = subscribeMotion(sync)

    return () => {
      alive = false
      window.removeEventListener("load", schedule)
      window.cancelIdleCallback?.(idle)
      unsub()
      stop()
    }
  }, [])

  return null
}
