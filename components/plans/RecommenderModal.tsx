"use client"

import { useTranslations } from "next-intl"
import { XIcon } from "lucide-react"
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { PlanRecommender } from "./PlanRecommender"

/**
 * The plan helper in a dialog. Loaded with next/dynamic on the first click of
 * RecommenderPrompt, so Base UI's dialog and the helper's icons stay out of
 * first-load JS.
 */
export function RecommenderModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("recommender")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="surface max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto rounded-2xl bg-transparent p-0 ring-0 sm:max-w-xl"
      >
        <PlanRecommender onClose={() => onOpenChange(false)} />
        <DialogClose
          render={<Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" />}
        >
          <XIcon aria-hidden />
          <span className="sr-only">{t("close")}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
