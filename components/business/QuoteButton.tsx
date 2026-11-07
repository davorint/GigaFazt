import { useTranslations } from "next-intl"
import { MessageCircle } from "lucide-react"
import { cn } from "cn"
import { TrackedLink } from "@/components/hud/TrackedLink"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { whatsappHref } from "@/lib/contact"

/** "Cotizar por WhatsApp": business quotes go straight to a chat (no prices online). */
export function QuoteButton({ context, className }: { context: string; className?: string }) {
  const t = useTranslations("business")
  const base =
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2.5 font-mono text-xs uppercase tracking-wider"
  if (isPlaceholder(company.whatsapp)) {
    return (
      <span className={cn(base, "border border-border text-muted-foreground", className)}>
        <MessageCircle className="size-4" aria-hidden />
        {t("quote")}
        <PlaceholderChip keyName={company.whatsapp.key} />
      </span>
    )
  }
  return (
    <TrackedLink
      href={whatsappHref(company.whatsapp, t("whatsappMessage"))}
      target="_blank"
      rel="noopener noreferrer"
      event="whatsapp_clicked"
      props={{ context }}
      className={cn(
        base,
        "bg-fiber font-semibold text-background shadow-[0_0_24px_-6px_var(--color-fiber)] transition-colors hover:bg-fiber/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      {t("quote")}
    </TrackedLink>
  )
}
