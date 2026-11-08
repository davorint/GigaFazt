import { useTranslations } from "next-intl"
import {
  Building2,
  Cctv,
  Clapperboard,
  DatabaseBackup,
  HardDrive,
  KeyRound,
  MonitorPlay,
  Phone,
  PiggyBank,
  PlugZap,
  Share2,
  ShieldCheck,
  TrendingUp,
  Wifi,
} from "lucide-react"
import { business, transferSeconds } from "@/lib/business"

const ICONS = {
  storage: HardDrive,
  cameras: Cctv,
  sharing: Share2,
  sharedHardware: PiggyBank,
  futureProof: TrendingUp,
  backups: DatabaseBackup,
  editing: Clapperboard,
  voip: Phone,
  segments: ShieldCheck,
  buildings: Building2,
  security: KeyRound,
  signage: MonitorPlay,
  fewerClosets: PlugZap,
  wifi7: Wifi,
} as const

/**
 * What an internal fiber network (10–800 Gbps, lib/business) makes possible,
 * as a two-column grid of hairline cells. The transfer times are computed at line
 * rate and labelled theoretical (hard rule #4).
 */
export function BusinessLan() {
  const t = useTranslations("business.lan")
  const { from, to } = business.internalNetworkGbps
  const gb = business.sampleFileGb
  const secs = (gbps: number) => Math.max(1, Math.round(transferSeconds(gb, gbps)))

  return (
    <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 sm:py-32">
      <div className="reveal grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
        <div>
          <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.25em] text-zinc-400">
            <span aria-hidden className="h-px w-8 bg-[var(--biz-accent)]" />
            {t("eyebrow")}
          </p>
          <h2 className="mt-5 max-w-xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">{t("title", { to })}</h2>
        </div>
        <p className="max-w-md text-zinc-400 lg:justify-self-end">{t("lead")}</p>
      </div>

      <ul className="reveal-stagger mt-16 grid border-t border-l border-[var(--biz-line)] md:grid-cols-2">
        {business.lanBenefits.map((id) => {
          const Icon = ICONS[id]
          return (
            <li key={id} className="border-r border-b border-[var(--biz-line)] p-6 sm:p-8">
              <Icon className="size-6 text-[var(--biz-accent)]" strokeWidth={1.5} aria-hidden />
              <h3 className="mt-6 text-xl font-medium tracking-[-0.02em] text-white sm:text-2xl">{t(`items.${id}.title`)}</h3>
              <p className="mt-3 max-w-md leading-relaxed text-zinc-400">
                {t(`items.${id}.body`, { gb, from, to, tFrom: secs(from), tTo: secs(to) })}
              </p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
