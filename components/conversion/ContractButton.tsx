"use client"

import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { selection, useSelection } from "@/lib/selection"
import { track } from "@/lib/analytics"

/**
 * "Contratar" CTA that opens the lead Sheet (needs a LeadSheetHost on the
 * page). Without `planId` it keeps the visitor's current selection.
 */
export function ContractButton({
  context,
  planId,
  className,
}: {
  context: string
  planId?: string
  className?: string
}) {
  const t = useTranslations("common")
  const current = useSelection((s) => s.planId)
  return (
    <Button
      size="lg"
      className={className}
      onClick={() => {
        track("plan_selected", { context, planId: planId ?? current })
        selection.openLead(planId)
      }}
    >
      {t("contract")}
      <ArrowRight aria-hidden />
    </Button>
  )
}
