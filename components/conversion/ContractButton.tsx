"use client"

import { useTranslations } from "next-intl"
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
      className={className ?? "font-mono text-xs tracking-wider shadow-[0_0_20px_-4px_var(--color-fiber)]"}
      onClick={() => {
        track("plan_selected", { context, planId: planId ?? current })
        selection.openLead(planId)
      }}
    >
      [ {t("contract").toUpperCase()} ]
    </Button>
  )
}
