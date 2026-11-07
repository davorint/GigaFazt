import { useTranslations } from "next-intl"
import { BadgeCheck, Clock, Headset, ShieldCheck } from "lucide-react"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder, type Maybe } from "@/lib/placeholder"

/** Trust strip (SPEC §3): no hidden fees · install time · local support · guarantee. */
export function TrustStrip() {
  const t = useTranslations("trust")
  const { installDays, guarantee } = company.terms

  const value = (v: Maybe<string>) =>
    isPlaceholder(v) ? <PlaceholderChip keyName={v.key} /> : <span className="text-foreground">{v}</span>

  const items = [
    { icon: BadgeCheck, label: t("noHiddenFees"), extra: null },
    { icon: Clock, label: t("install"), extra: value(installDays) },
    { icon: Headset, label: t("localSupport"), extra: null },
    { icon: ShieldCheck, label: t("guarantee"), extra: value(guarantee) },
  ]

  return (
    <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ icon: Icon, label, extra }) => (
        <li key={label} className="flex items-center gap-3 bg-surface px-5 py-4 text-sm">
          <Icon className="size-4 shrink-0 text-ok" aria-hidden />
          <span className="text-muted-foreground">{label}</span>
          {extra}
        </li>
      ))}
    </ul>
  )
}
