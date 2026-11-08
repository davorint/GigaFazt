import { motionReduced } from "./motion"

/** The smooth scroller (Lenis, set by layout/SmoothScroll) when it runs. */
type Scroller = { scrollTo: (el: HTMLElement, opts: { offset?: number }) => void }
let scroller: Scroller | null = null
export function setScroller(s: Scroller | null) {
  scroller = s
}

/** Scrolls with the smooth scroller when it runs, natively otherwise. */
function scrollToEl(el: HTMLElement, block: "start" | "center") {
  if (scroller && !motionReduced()) {
    const offset =
      block === "center"
        ? -Math.max(0, (window.innerHeight - el.getBoundingClientRect().height) / 2)
        : -(parseFloat(getComputedStyle(el).scrollMarginTop) || 0)
    scroller.scrollTo(el, { offset })
    return
  }
  el.scrollIntoView({ behavior: motionReduced() ? "auto" : "smooth", block })
}

/** Scroll to a section, smooth unless the visitor prefers reduced motion. */
export function scrollToId(id: string): boolean {
  const el = document.getElementById(id)
  if (!el) return false
  scrollToEl(el, "start")
  return true
}

/** Scroll to a plan card (plans/PlanCard `data-plan`) and flash it. */
export function showPlanCard(id: string) {
  const card = document.querySelector<HTMLElement>(`[data-plan="${id}"]`)
  if (!card) return
  scrollToEl(card, "center")
  card.classList.remove("plan-flash")
  void card.offsetWidth // restart the animation
  card.classList.add("plan-flash")
  window.setTimeout(() => card.classList.remove("plan-flash"), 2400)
}
