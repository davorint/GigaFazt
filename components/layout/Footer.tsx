import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { StatusBadge } from "@/components/hud/StatusBadge"
import { TrackedLink } from "@/components/hud/TrackedLink"
import type { AnalyticsEvent } from "@/lib/analytics"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { STATES } from "@/lib/geo/states"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { telHref, whatsappHref } from "@/lib/contact"

const A = "rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

/** Value, external link or chip for a BUSINESS.md field. */
function Field({
  label,
  value,
  href,
  event,
}: {
  label: string
  value: Maybe<string>
  href?: (v: string) => string
  event?: AnalyticsEvent
}) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      {isPlaceholder(value) ? (
        <>
          <span className="text-muted-foreground">{label}</span>
          <PlaceholderChip keyName={value.key} />
        </>
      ) : href && event ? (
        <TrackedLink href={href(value)} event={event} props={{ context: "footer" }} className={A}>
          {label}
        </TrackedLink>
      ) : href ? (
        <a href={href(value)} className={A}>
          {label}
        </a>
      ) : (
        <span className="text-muted-foreground">
          {label}: <span className="text-foreground">{value}</span>
        </span>
      )}
    </li>
  )
}

/**
 * Footer (SPEC §8): status badge · Aviso de Privacidad (LFPDPPP) · Términos ·
 * regulatory registration · contact · social. Shared by every page; `base` is
 * the locale home ("/es") so section links work off the home page.
 */
export function Footer({ base = "" }: { base?: string }) {
  const t = useTranslations("footer")
  const tn = useTranslations("nav")
  const locale = useLocale()
  const prefix = base || `/${locale}`

  return (
    <footer id="footer" data-section="footer" className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span aria-hidden className="inline-block size-4 rotate-45 rounded-[3px] bg-fiber shadow-[0_0_12px_var(--color-fiber)]" />
            {isPlaceholder(company.name) ? (
              <PlaceholderChip keyName={company.name.key} />
            ) : (
              <span className="font-mono text-sm">{company.name}</span>
            )}
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
          <StatusBadge />
        </div>

        <nav aria-label={t("explore")}>
          <h2 className="eyebrow mb-3">{t("explore")}</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/planes" className={A}>{tn("planes")}</Link></li>
            <li><a href={`${prefix}#fiber`} className={A}>{tn("fibra")}</a></li>
            <li><a href={`${prefix}#map`} className={A}>{tn("cobertura")}</a></li>
            <li><a href={`${prefix}#faq`} className={A}>{t("faq")}</a></li>
          </ul>
        </nav>

        <nav aria-label={t("coverage")}>
          <h2 className="eyebrow mb-3">{t("coverage")}</h2>
          <ul className="space-y-2 text-sm">
            {STATES.map((s) => (
              <li key={s.slug}>
                <Link href={`/cobertura/${s.slug}`} className={A}>
                  {s.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="eyebrow mb-3">{t("contact")}</h2>
          <ul className="space-y-2 text-sm">
            <Field label="WhatsApp" value={company.whatsapp} href={(v) => whatsappHref(v)} event="whatsapp_clicked" />
            <Field label={t("phone")} value={company.salesPhone} href={telHref} />
            <Field label={t("email")} value={company.salesEmail} href={(v) => `mailto:${v}`} />
            <li className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{t("social")}</span>
              {isPlaceholder(company.social) ? (
                <PlaceholderChip keyName={company.social.key} />
              ) : (
                company.social.map((s) => (
                  <a key={s.url} href={s.url} rel="noopener noreferrer" target="_blank" className={A}>
                    {s.label}
                  </a>
                ))
              )}
            </li>
          </ul>
        </div>

        <div>
          <h2 className="eyebrow mb-3">{t("legal")}</h2>
          <ul className="space-y-2 text-sm">
            <Field label={t("privacy")} value={company.legal.privacyUrl} href={(v) => v} />
            <Field label={t("terms")} value={company.legal.termsUrl} href={(v) => v} />
            <Field label={t("regulatory")} value={company.regulatory} />
          </ul>
        </div>
      </div>
    </footer>
  )
}
