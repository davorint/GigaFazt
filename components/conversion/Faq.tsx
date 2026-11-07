import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, ChevronDown } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { isPlaceholder } from "@/lib/placeholder"
import { factText, faqEntries } from "./faq-content"

/**
 * FAQ (SPEC §8). Native <details>/<summary> disclosure instead of the Base UI
 * Accordion: zero JS (the Accordion chunk cost ~10 KB gz and pushed first-load
 * past the 200 KB budget, hard rule #8), keyboard-accessible by default, and
 * answers stay in the HTML for crawlers and find-in-page.
 * Business values come from BUSINESS.md as facts (chips when unfilled).
 */
export function Faq() {
  const t = useTranslations()
  const locale = useLocale()
  const entries = faqEntries(t, locale)

  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <p className="eyebrow mb-3">[ {t("sections.faq")} ]</p>
      <h2 className="text-3xl font-semibold tracking-[-0.02em] sm:text-4xl">{t("sectionHeads.faq")}</h2>
      <p className="mt-3 text-muted-foreground">{t("faq.lead")}</p>

      <div className="mt-10 divide-y divide-border rounded-xl surface">
        {entries.map(({ item, question, answer }) => (
          <details key={item.id} id={`faq-${item.id}`} className="group px-5">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-md py-4 font-medium transition-colors hover:text-fiber focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
              <span className="text-base">{question}</span>
              <ChevronDown
                aria-hidden
                className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
              />
            </summary>
            <div className="pb-5 text-sm text-muted-foreground">
              <p>{answer}</p>
              {item.facts.length > 0 && (
                <dl className="mt-3 space-y-1.5 font-mono text-xs">
                  {item.facts.map((f) => (
                    <div key={f.label} className="flex flex-wrap items-center gap-2">
                      <dt>{t(`faq.facts.${f.label}`)}</dt>
                      <dd className="text-foreground">
                        {isPlaceholder(f.value) ? <PlaceholderChip keyName={f.value.key} /> : factText(f, locale, t)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </details>
        ))}
      </div>

      <div className="mt-10 flex justify-center">
        <a
          href="#cta"
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 font-mono text-xs uppercase tracking-wider text-fiber hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {t("faq.cta")}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
    </div>
  )
}
