import { useTranslations } from "next-intl"
import { MessageCircle } from "lucide-react"
import { cn } from "cn"
import { TrackedLink } from "@/components/hud/TrackedLink"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { whatsappHref } from "@/lib/contact"

/** "Cotizar por WhatsApp": business quotes go straight to a chat (no prices online), optionally with a specific opening message. White, sharp: the /empresas primary action. */
export function QuoteButton({ context, message, className }: { context: string; message?: string; className?: string }) {
  const t = useTranslations("business")
  const base =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-[3px] px-6 py-3 font-mono text-xs uppercase tracking-[0.18em]"
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
      href={whatsappHref(company.whatsapp, message ?? t("whatsappMessage"))}
      target="_blank"
      rel="noopener noreferrer"
      event="whatsapp_clicked"
      props={{ context }}
      className={cn(
        base,
        "bg-white font-semibold text-black transition-colors hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-[var(--biz-accent,var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        className
      )}
    >
      <MessageCircle className="size-4" aria-hidden />
      {t("quote")}
    </TrackedLink>
  )
}
