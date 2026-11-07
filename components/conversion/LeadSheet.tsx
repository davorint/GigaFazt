"use client"

import { useTranslations } from "next-intl"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { selection, useSelection } from "@/lib/selection"
import { LeadForm } from "./LeadForm"

/**
 * The "Contratar" Sheet (SPEC §3). Lazy-loaded by LeadSheetHost on the first
 * CTA click, so react-hook-form + zod + the dialog stay out of the first load.
 * The form remounts per request so it's always prefilled with the current
 * plan and add-ons.
 */
export default function LeadSheet() {
  const t = useTranslations("lead")
  const open = useSelection((s) => s.leadOpen)
  const request = useSelection((s) => s.leadRequest)
  const planId = useSelection((s) => s.planId)
  const addOnIds = useSelection((s) => s.addOnIds)

  return (
    <Sheet open={open} onOpenChange={selection.setLeadOpen}>
      <SheetContent
        side="right"
        className="overflow-y-auto bg-surface data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="text-lg font-semibold">{t("title")}</SheetTitle>
          <SheetDescription>{t("description")}</SheetDescription>
        </SheetHeader>
        <LeadForm
          key={request}
          planId={planId}
          addOnIds={addOnIds}
          onDone={() => selection.setLeadOpen(false)}
        />
      </SheetContent>
    </Sheet>
  )
}
