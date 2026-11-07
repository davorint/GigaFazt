import { useTranslations } from "next-intl"
import { BadgeCheck, Clock, Headset, ShieldCheck } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"

/**
 * Trust strip (SPEC §3): no hidden fees · install time · local support ·
 * guarantee. The two yes/no claims are owner-confirmed BUSINESS.md fields:
 * chip until set, hidden if false (hard rule #1).
 */
export function TrustStrip() {
  const t = useTranslations("trust")
  const { installDays, guarantee, noHiddenFees, localSupport } = company.terms

  const value = (v: Maybe<string>) =>
    isPlaceholder(v) ? <PlaceholderChip keyName={v.key} /> : <span className="text-foreground">{v}</span>

  const claim = (v: Maybe<boolean>) => (isPlaceholder(v) ? <PlaceholderChip keyName={v.key} /> : null)

  const items = [
    noHiddenFees !== false && { icon: BadgeCheck, label: t("noHiddenFees"), extra: claim(noHiddenFees) },
    { icon: Clock, label: t("install"), extra: value(installDays) },
    localSupport !== false && { icon: Headset, label: t("localSupport"), extra: claim(localSupport) },
    { icon: ShieldCheck, label: t("guarantee"), extra: value(guarantee) },
  ].filter((i) => i !== false)

  return (
    <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] shadow-[0_32px_64px_-32px_rgb(0_0_0_/_0.9)] sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, extra }) => (
        <li key={label} className="surface-cell flex items-center gap-3 px-5 py-4 text-sm">
          <Icon className="size-4 shrink-0 text-ok" aria-hidden />
          <span className="text-muted-foreground">{label}</span>
          {extra}
        </li>
      ))}
    </ul>
  )
}
