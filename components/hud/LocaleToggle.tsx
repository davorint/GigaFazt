"use client"

import { useLocale, useTranslations } from "next-intl"
import { usePathname, useRouter } from "@/i18n/navigation"
import { routing } from "@/i18n/routing"
import { cn } from "cn"

/** ES/EN switch that preserves the current path (next-intl navigation). */
export function LocaleToggle({ className }: { className?: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const t = useTranslations("nav")

  return (
    <div
      className={cn("flex items-center gap-0.5 font-mono text-xs", className)}
      role="group"
      aria-label={t("language")}
    >
      {routing.locales.map((l, i) => (
        <span key={l} className="flex items-center">
          {i > 0 && <span className="px-0.5 text-muted-foreground/50">/</span>}
          <button
            type="button"
            onClick={() => router.replace(pathname, { locale: l })}
            aria-current={l === locale}
            className={cn(
              "rounded px-1 uppercase transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              l === locale
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {l}
          </button>
        </span>
      ))}
    </div>
  )
}
