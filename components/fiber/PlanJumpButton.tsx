"use client"

import { selection } from "@/lib/selection"
import { track } from "@/lib/analytics"
import { showPlanCard } from "@/lib/scroll"

/** Hero plan bar cell: selects the plan, then scrolls to and flashes its card. */
export function PlanJumpButton({ planId, className, children }: { planId: string; className?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        selection.selectPlan(planId)
        track("plan_selected", { planId, context: "hero_strip" })
        // After React commits the selection (it re-renders the card's class).
        requestAnimationFrame(() => showPlanCard(planId))
      }}
    >
      {children}
    </button>
  )
}
