import { useTranslations } from "next-intl"
import { Activity, BadgeCheck, Clock, Headset, Router, ShieldCheck, Unlock, Wrench } from "lucide-react"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"

type Fact = { key: string; icon: typeof Wrench; value: string; sub: string }

/**
 * Trust strip (SPEC §3), redesigned 2026-11-07: owner-confirmed facts first
 * (free installation, no minimum term, modem included, 24 h monitoring), then
 * the BUSINESS.md claims only once the owner confirms them (no-hidden-fees,
 * local support, install days, guarantee). An unconfirmed claim isn't shown
 * here at all; those values keep their POR DEFINIR chips where they are
 * needed (install steps, FAQ, price terms), so nothing is invented or hidden.
 */
export function TrustStrip({ variant = "grid" }: { variant?: "grid" | "inline" }) {
  const t = useTranslations("trust")
  const { installFeeMxn, contractTerm, installDays, guarantee, noHiddenFees, localSupport } = company.terms
  const { monitoring24h } = company.network

  const facts: (Fact | false)[] = [
    installFeeMxn === 0 && { key: "free", icon: Wrench, value: t("freeInstall"), sub: t("freeInstallSub") },
    contractTerm === null && { key: "term", icon: Unlock, value: t("noTerm"), sub: t("noTermSub") },
    { key: "modem", icon: Router, value: t("modem"), sub: t("modemSub") },
    monitoring24h === true && { key: "monitor", icon: Activity, value: t("monitor"), sub: t("monitorSub") },
    noHiddenFees === true && { key: "fees", icon: BadgeCheck, value: t("noHiddenFees"), sub: "" },
    localSupport === true && { key: "support", icon: Headset, value: t("localSupport"), sub: "" },
    !isPlaceholder(installDays) && { key: "days", icon: Clock, value: `${t("install")} ${installDays}`, sub: "" },
    !isPlaceholder(guarantee) && { key: "guarantee", icon: ShieldCheck, value: t("guarantee"), sub: guarantee },
  ]
  const items = facts.filter((f): f is Fact => Boolean(f))

  // Inline: one quiet line under the plan cards (the sub-line stays for
  // assistive tech, e.g. "monitoring by technical staff", not 24 h support).
  if (variant === "inline")
    return (
      <ul className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3 text-sm">
        {items.map(({ key, icon: Icon, value, sub }) => (
          <li key={key} className="flex items-center gap-2 font-medium text-foreground/90">
            <Icon className="size-4 shrink-0 text-ok drop-shadow-[0_0_6px_var(--color-ok)]" aria-hidden />
            {value}
            {sub && <span className="sr-only">: {sub}</span>}
          </li>
        ))}
      </ul>
    )

  return (
    <ul className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ key, icon: Icon, value, sub }) => (
        <li key={key} className="surface-cell flex items-center gap-3.5 px-4 py-5 sm:px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-ok/30 bg-ok/10 shadow-[0_0_20px_-6px_var(--color-ok)]">
            <Icon className="size-[18px] text-ok" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold leading-tight text-foreground sm:text-base">{value}</span>
            {sub && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{sub}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}
