"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { ArrowRight, Sparkles } from "lucide-react"

const RecommenderModal = dynamic(() => import("./RecommenderModal").then((m) => m.RecommenderModal), {
  ssr: false,
})

/**
 * "¿No sabes cuál elegir? Ayúdame a elegir →": one line under the plan cards.
 * The 3-step helper opens in a dialog (loaded on first click).
 */
export function RecommenderPrompt() {
  const t = useTranslations("recommender")
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-sm text-muted-foreground">
      <Sparkles className="size-4 text-up" aria-hidden />
      {t("promptTitle")}
      <button
        type="button"
        aria-haspopup="dialog"
        className="inline-flex items-center gap-1 rounded-sm font-medium text-fiber underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => {
          setLoaded(true)
          setOpen(true)
        }}
      >
        {t("promptCta")}
        <ArrowRight className="size-3.5" aria-hidden />
      </button>
      {loaded && <RecommenderModal open={open} onOpenChange={setOpen} />}
    </div>
  )
}
