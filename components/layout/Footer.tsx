import { useLocale, useTranslations } from "next-intl"
import { Link } from "@/i18n/navigation"
import { StatusBadge } from "@/components/hud/StatusBadge"
import { BrandLogo } from "@/components/hud/BrandLogo"
import { MotionToggle } from "@/components/hud/MotionToggle"
import { TrackedLink } from "@/components/hud/TrackedLink"
import type { AnalyticsEvent } from "@/lib/analytics"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { STATES } from "@/lib/geo/states"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"
import { telHref, whatsappHref } from "@/lib/contact"
import { stateName } from "@/lib/geo/state-names"

/** "+52 5540947678" → "5540947678": local visitors read national format; links keep +52. */
const national = (v: string) => v.replace(/^\+52\s*/, "")

/** Site paths ("/aviso-de-privacidad") get the locale prefix; absolute URLs pass through. */
const localHref = (v: string, prefix: string) => (v.startsWith("/") ? `${prefix}${v}` : v)

const A = "rounded text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"

/** Value, external link or chip for a BUSINESS.md field. */
function Field({
  label,
  value,
  href,
  event,
  showValue = true,
  display = (v) => v,
}: {
  label: string
  value: Maybe<string>
  href?: (v: string) => string
  event?: AnalyticsEvent
  /** Show the value next to the label (contact data); off for legal URLs. */
  showValue?: boolean
  /** Visible form of the value (e.g. national phone format). */
  display?: (v: string) => string
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
          {label} <span className="whitespace-nowrap font-mono text-foreground">{display(value)}</span>
        </TrackedLink>
      ) : href ? (
        <a href={href(value)} className={A}>
          {label}
          {showValue && <> <span className="whitespace-nowrap font-mono text-foreground">{display(value)}</span></>}
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
 * contact. Shared by every page; `base` is
 * the locale home ("/es") so section links work off the home page. Bottom
 * padding on mobile clears the fixed quick-nav bar.
 */
export function Footer({ base = "" }: { base?: string }) {
  const t = useTranslations("footer")
  const tn = useTranslations("nav")
  const ts = useTranslations("states")
  const locale = useLocale()
  const prefix = base || `/${locale}`

  return (
    <footer id="footer" data-section="footer" className="relative overflow-hidden border-t border-border bg-background pb-16 [background-image:radial-gradient(55%_45%_at_50%_100%,rgb(6_182_212/0.05),transparent_70%),radial-gradient(35%_30%_at_85%_100%,rgb(167_139_250/0.04),transparent_70%)] md:pb-0">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {isPlaceholder(company.name) ? (
              <PlaceholderChip keyName={company.name.key} />
            ) : (
              <BrandLogo alt={company.name} height={36} className="-ml-1.5" />
            )}
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
          <StatusBadge />
          <MotionToggle withLabel />
        </div>

        <nav aria-label={t("explore")}>
          <h2 className="eyebrow mb-3">{t("explore")}</h2>
          <ul className="space-y-2 text-sm">
            <li><Link href="/planes" className={A}>{tn("planes")}</Link></li>
            <li><Link href="/empresas" className={A}>{tn("empresas")}</Link></li>
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
                  {stateName(ts, s.slug)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="eyebrow mb-3">{t("contact")}</h2>
          <ul className="space-y-2 text-sm">
            <Field label={tn("whatsapp")} value={company.whatsapp} href={(v) => whatsappHref(v)} event="whatsapp_clicked" display={national} />
            <Field label={t("phone")} value={company.salesPhone} href={telHref} display={national} />
            <Field label={t("email")} value={company.salesEmail} href={(v) => `mailto:${v}`} />
          </ul>
        </div>

        <div>
          <h2 className="eyebrow mb-3">{t("legal")}</h2>
          <ul className="space-y-2 text-sm">
            <Field label={t("privacy")} value={company.legal.privacyUrl} href={(v) => localHref(v, prefix)} showValue={false} />
            <Field label={t("terms")} value={company.legal.termsUrl} href={(v) => localHref(v, prefix)} showValue={false} />
          </ul>
        </div>
      </div>

      {/* Oversized faded wordmark, cropped by the footer's bottom edge. Decorative:
          the name is already in the brand block above. */}
      {!isPlaceholder(company.name) && (
        <div aria-hidden className="pointer-events-none relative mx-auto max-w-7xl select-none px-4 sm:px-6">
          <div className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent sm:inset-x-6" />
          <p className="footer-wordmark -mb-[0.16em] pt-6 text-center text-[clamp(4.5rem,18.5vw,17rem)] leading-[0.8] font-semibold tracking-[-0.055em]">
            {company.name}
          </p>
        </div>
      )}
    </footer>
  )
}
