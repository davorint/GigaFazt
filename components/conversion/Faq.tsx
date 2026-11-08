import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Clock, MessageCircle, Plus } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { TrackedLink } from "@/components/hud/TrackedLink"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { hourLabel } from "@/lib/format"
import { isPlaceholder } from "@/lib/placeholder"
import { factText, faqEntries } from "./faq-content"
import { RevealHeading } from "@/components/layout/RevealHeading"

/**
 * FAQ (SPEC §8), two columns (2026-11-07): a sticky intro + WhatsApp help card
 * on the left, the questions on the right as numbered cards. Native
 * <details>/<summary> instead of the Base UI Accordion: zero JS (the Accordion
 * chunk cost ~10 KB gz, hard rule #8), keyboard-accessible, answers stay in
 * the HTML. Opening animates with CSS (`.faq-item`, ::details-content) where
 * supported. Business values are fact chips (POR DEFINIR when unfilled).
 */
export function Faq() {
  const t = useTranslations()
  const locale = useLocale()
  const entries = faqEntries(t, locale)
  const hours = company.policies.officeHours

  return (
    <div className="mx-auto grid max-w-7xl gap-12 section-pad px-4 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <RevealHeading className="display-2">{t("sectionHeads.faq")}</RevealHeading>
        <p className="section-lead max-w-md">{t("faq.lead")}</p>

        <div className="surface hud-brackets relative mt-8 max-w-md rounded-2xl p-6">
          <p className="text-lg font-semibold tracking-[-0.01em]">{t("faq.helpTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("faq.helpBody")}</p>
          {!isPlaceholder(hours) && (
            <p className="mt-4 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Clock className="size-3.5 text-fiber" aria-hidden />
              {t("faq.officeHoursValue", { open: hourLabel(hours.open, locale), close: hourLabel(hours.close, locale) })}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {isPlaceholder(company.whatsapp) ? (
              <PlaceholderChip keyName={company.whatsapp.key} />
            ) : (
              <TrackedLink
                href={whatsappHref(company.whatsapp)}
                target="_blank"
                rel="noopener noreferrer"
                event="whatsapp_clicked"
                props={{ context: "faq" }}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-5 text-sm font-medium transition-colors hover:border-white/25 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <MessageCircle className="size-4 text-ok" aria-hidden />
                {t("cta.whatsapp")}
              </TrackedLink>
            )}
            <a
              href="#cta"
              className="inline-flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-foreground/75 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {t("faq.cta")}
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>

      <ol className="space-y-3">
        {entries.map(({ item, question, answer }, i) => (
          <li key={item.id}>
            <details id={`faq-${item.id}`} className="faq-item group rounded-xl border border-white/10 bg-white/[0.02] transition-colors open:border-fiber/40 open:bg-fiber/[0.04] hover:border-white/20">
              <summary className="flex cursor-pointer list-none items-center gap-4 rounded-xl px-5 py-4 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                <span aria-hidden className="font-mono text-xs tabular-nums text-muted-foreground group-open:text-fiber">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="flex-1 text-base font-medium">{question}</span>
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-white/15 text-muted-foreground transition-[transform,color,border-color] duration-200 group-open:rotate-45 group-open:border-fiber/60 group-open:text-fiber"
                >
                  <Plus className="size-4" />
                </span>
              </summary>
              <div className="px-5 pb-5 pl-[3.25rem] text-sm leading-relaxed text-muted-foreground">
                <p>{answer}</p>
                {item.facts.length > 0 && (
                  <dl className="mt-4 flex flex-wrap gap-2 font-mono text-xs">
                    {item.facts.map((f) => (
                      <div key={f.label} className="flex items-center gap-1.5 rounded-md border border-white/10 bg-background/60 px-2.5 py-1.5">
                        <dt>{t(`faq.facts.${f.label}`)}:</dt>
                        <dd className="text-foreground">
                          {isPlaceholder(f.value) ? <PlaceholderChip keyName={f.value.key} /> : factText(f, locale, t)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </div>
  )
}
