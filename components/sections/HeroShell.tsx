"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import type { Segment } from "@/lib/types"
import { lowestPrice } from "@/lib/plans"
import { isPlaceholder } from "@/lib/placeholder"
import { track } from "@/lib/analytics"

/**
 * Phase-1 hero shell: real copy + segment switcher + price anchor + address bar.
 * The 3D FiberScene, SVG poster (LCP) and Coverage Dialog land in Phase 2; the
 * address bar currently only emits the analytics event.
 */
export function HeroShell() {
  const t = useTranslations("hero")
  const ts = useTranslations("segment")
  const [segment, setSegment] = useState<Segment>("hogar")

  const price = lowestPrice(segment)

  return (
    <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col justify-center px-4 pt-24 pb-16 sm:px-6">
      <p className="eyebrow">[ {t("eyebrow")} ]</p>

      <h1 className="mt-5 max-w-4xl text-balance text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
        {t("h1")}
      </h1>

      {/* Segment switcher (Phase 2 lifts this into global state). */}
      <div
        role="group"
        aria-label="Hogar · Empresa"
        className="mt-8 inline-flex w-fit rounded-lg border border-border bg-surface p-1 font-mono text-xs"
      >
        {(["hogar", "empresa"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={segment === s}
            onClick={() => {
              setSegment(s)
              track("segment_switched", { segment: s })
            }}
            className={cn(
              "rounded-md px-4 py-1.5 uppercase tracking-wider transition-colors",
              segment === s
                ? "bg-fiber text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {ts(s)}
          </button>
        ))}
      </div>

      <p className="mt-6 max-w-xl text-lg text-muted-foreground">
        {segment === "hogar" ? t("subhead_hogar") : t("subhead_empresa")}
      </p>

      {/* Price anchor */}
      <p className="mt-6 flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        {t.rich("priceAnchor", {
          price: () =>
            isPlaceholder(price) ? (
              <PlaceholderChip keyName={price.key} className="mx-0.5" />
            ) : (
              <span className="text-foreground">
                ${price.toLocaleString("es-MX")}
              </span>
            ),
        })}
      </p>

      {/* Address lookup (functional dialog arrives in Phase 2). */}
      <form
        className="mt-8 flex w-full max-w-xl flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault()
          track("coverage_check_started", { context: "hero" })
        }}
      >
        <label htmlFor="hero-address" className="sr-only">
          {t("addressLabel")}
        </label>
        <Input
          id="hero-address"
          name="address"
          placeholder={t("addressPlaceholder")}
          autoComplete="street-address"
          className="h-11 flex-1 bg-surface font-mono text-sm"
        />
        <Button
          type="submit"
          size="lg"
          className="h-11 font-mono text-xs tracking-wider shadow-[0_0_24px_-6px_var(--color-fiber)]"
        >
          {t("checkCoverage").toUpperCase()}
          <ArrowRight />
        </Button>
      </form>
    </div>
  )
}
