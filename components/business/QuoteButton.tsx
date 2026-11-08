import { useTranslations } from "next-intl"
import { ArrowUpRight, MessageCircle } from "lucide-react"
import { cn } from "cn"
import { QuoteLink } from "./QuoteLink"
import type { BriefPreset } from "@/lib/brief"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { whatsappHref } from "@/lib/contact"

/**
 * The /empresas primary action, "Cotizar proyecto": opens the project brief
 * (lib/brief), which ends in a WhatsApp chat with a structured summary;
 * without JS it is a plain WhatsApp link with `message` (business quotes are
 * per project, no prices online). Sans-serif, sentence case, near-square corners
 * (the page's sharp language); a small WhatsApp glyph says where it goes and
 * the channel is in the accessible name. `ghost` = hairline secondary.
 */
export function QuoteButton({
  context,
  message,
  preset,
  variant = "primary",
  className,
}: {
  context: string
  message?: string
  /** What the brief can pre-answer (lib/brief). */
  preset?: BriefPreset
  variant?: "primary" | "ghost"
  className?: string
}) {
  const t = useTranslations("business")
  const base =
    "group inline-flex min-h-12 items-center justify-center gap-2.5 rounded-[4px] px-6 py-3 text-[0.95rem] font-medium tracking-[-0.005em]"
  if (isPlaceholder(company.whatsapp)) {
    return (
      <span className={cn(base, "border border-[var(--biz-line-strong,var(--border))] text-zinc-400", className)}>
        {t("quote")}
        <PlaceholderChip keyName={company.whatsapp.key} />
      </span>
    )
  }
  return (
    <QuoteLink
      href={whatsappHref(company.whatsapp, message ?? t("whatsappMessage"))}
      target="_blank"
      rel="noopener noreferrer"
      context={context}
      preset={preset}
      className={cn(
        base,
        "transition-[background-color,border-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-[var(--biz-accent,var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
        variant === "primary"
          ? "bg-white text-black shadow-[0_0_0_1px_rgb(255_255_255/0.6),0_10px_40px_-12px_rgb(167_139_250/0.55)] hover:bg-zinc-100 hover:shadow-[0_0_0_1px_#fff,0_14px_50px_-10px_rgb(167_139_250/0.8)]"
          : "border border-[var(--biz-line-strong,var(--border))] text-white hover:border-white/40 hover:bg-white/[0.04]",
        className
      )}
    >
      <MessageCircle className={cn("size-4", variant === "primary" ? "text-emerald-600" : "text-emerald-400")} aria-hidden />
      {t("quote")}
      <span className="sr-only"> {t("quoteChannel")}</span>
      <ArrowUpRight className="size-4 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100" aria-hidden />
    </QuoteLink>
  )
}
