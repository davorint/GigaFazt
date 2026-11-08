"use client"

import { ArrowRight, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { featuredPlan } from "@/lib/plans"
import { track } from "@/lib/analytics"
import { scrollToId } from "@/lib/scroll"

/** The hero's two actions (the only interactive part of the server-rendered hero). */
export function HeroActions({ viewPlans, coverageLink }: { viewPlans: string; coverageLink: string }) {
  return (
    <>
      <Button
        size="lg"
        onClick={() => {
          track("plan_selected", { planId: featuredPlan.id, context: "hero" })
          scrollToId("plans")
        }}
      >
        {viewPlans}
        <ArrowRight />
      </Button>
      <Button
        variant="ghost"
        size="lg"
        className="gap-1.5 text-muted-foreground"
        onClick={() => scrollToId("map")}
      >
        <MapPin />
        {coverageLink}
      </Button>
    </>
  )
}
