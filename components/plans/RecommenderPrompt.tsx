"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

const RecommenderModal = dynamic(() => import("./RecommenderModal").then((m) => m.RecommenderModal), {
  ssr: false,
})

/**
 * "¿No sabes cuál elegir?": a slim prompt under the plan cards. The 3-step
 * helper opens in a dialog (loaded on first click) instead of taking half a
 * screen of the Plans section.
 */
export function RecommenderPrompt() {
  const t = useTranslations("recommender")
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="surface flex flex-col items-start gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-up/30 bg-up/10">
        <Sparkles className="size-5 text-up" aria-hidden />
      </span>
      <div className="flex-1">
        <h3 className="text-lg font-semibold tracking-[-0.02em]">{t("promptTitle")}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("promptLead")}</p>
      </div>
      <Button
        variant="outline"
        size="lg"
        className="h-11 font-mono text-xs uppercase tracking-wider max-sm:w-full"
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true)
          setOpen(true)
        }}
      >
        {t("promptCta")}
        <ArrowRight aria-hidden />
      </Button>
      {loaded && <RecommenderModal open={open} onOpenChange={setOpen} />}
    </div>
  )
}
