import { useTranslations } from "next-intl"
import { cn } from "cn"
import { clients } from "@/lib/clients"
import { SimTag } from "@/components/hud/SimTag"

/** Floating glass legend (SPEC §5). Demo row only when demo clients exist. */
export function MapLegend({ className }: { className?: string }) {
  const t = useTranslations("map.legend")
  const hasDemo = clients.some((c) => c.demo)

  return (
    <ul
      className={cn(
        "space-y-1.5 rounded-lg border border-border bg-background/75 px-3 py-2.5 font-mono text-[0.65rem] text-muted-foreground backdrop-blur-md",
        className
      )}
    >
      <li className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-full bg-fiber shadow-[0_0_6px_var(--color-fiber)]" />
        {t("client")}
      </li>
      {hasDemo && (
        <li className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-full border border-warn" />
          {t("demo")}
          <SimTag kind="demo" />
        </li>
      )}
      <li className="flex items-center gap-2">
        <span aria-hidden className="h-2.5 w-3.5 rounded-sm border border-fiber/60 bg-fiber/15" />
        {t("zone")}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="w-3.5 border-t border-dashed border-fiber" />
        {t("corridor")}
      </li>
    </ul>
  )
}
