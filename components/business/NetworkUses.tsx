import { useTranslations } from "next-intl"
import {
  Building2,
  Clapperboard,
  DatabaseBackup,
  HardDrive,
  KeyRound,
  MonitorPlay,
  Phone,
  PiggyBank,
  PlugZap,
  Wifi,
} from "lucide-react"
import { business, transferSeconds } from "@/lib/business"
import { InView } from "@/components/layout/InView"

const FEATURED = ["sharing", "segments", "cameras", "futureProof"] as const
const MORE_ICONS = {
  storage: HardDrive,
  sharedHardware: PiggyBank,
  backups: DatabaseBackup,
  editing: Clapperboard,
  voip: Phone,
  buildings: Building2,
  security: KeyRound,
  signage: MonitorPlay,
  fewerClosets: PlugZap,
  wifi7: Wifi,
} as const

/**
 * What an internal fiber network makes possible: the four strongest uses as
 * cards with their own small diagram (decorative; the card text carries the
 * meaning), then the rest as a compact list of titles. Transfer times are at
 * line rate and labelled theoretical (hard rule #4).
 */
export function NetworkUses() {
  const t = useTranslations("business")
  const { from, to } = business.internalNetworkGbps
  const gb = business.sampleFileGb
  const secs = (gbps: number) => Math.max(1, Math.round(transferSeconds(gb, gbps)))
  const more = business.lanBenefits.filter((id): id is keyof typeof MORE_ICONS => id in MORE_ICONS)

  const visual = {
    sharing: <Race gb={gb} lanes={[{ label: `${from}GbE`, s: secs(from) }, { label: `${to}GbE`, s: secs(to) }]} />,
    segments: <Lanes />,
    cameras: <Cameras />,
    futureProof: <Future from={from} to={to} />,
  }

  return (
    <div>
      <h3 className="reveal text-2xl font-medium tracking-[-0.02em] text-white sm:text-3xl">{t("fiber.usesTitle")}</h3>
      <ul className="reveal-stagger mt-10 grid gap-px overflow-hidden border border-[var(--biz-line)] bg-[var(--biz-line)] md:grid-cols-2">
        {FEATURED.map((id) => (
          <li key={id} className="flex flex-col bg-[var(--biz-bg)]">
            <InView className="biz-use-visual relative h-48 overflow-hidden border-b border-[var(--biz-line)] bg-[var(--biz-panel)] sm:h-56">
              <div aria-hidden className="biz-blueprint pointer-events-none absolute inset-0 opacity-50" />
              <div className="relative h-full">{visual[id]}</div>
            </InView>
            <div className="p-6 sm:p-8">
              <h4 className="text-xl font-medium tracking-[-0.02em] text-white sm:text-2xl">{t(`lan.items.${id}.title`)}</h4>
              <p className="mt-3 max-w-md leading-relaxed text-zinc-400">
                {t(`lan.items.${id}.body`, { gb, from, to, tFrom: secs(from), tTo: secs(to) })}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <h3 className="reveal mt-16 text-sm text-zinc-400">{t("fiber.moreTitle")}</h3>
      <ul className="reveal-stagger mt-5 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {more.map((id) => {
          const Icon = MORE_ICONS[id]
          return (
            <li key={id} className="flex items-center gap-3 border-b border-[var(--biz-line)] py-4 text-zinc-200">
              <Icon className="size-4 shrink-0 text-[var(--biz-accent)]" strokeWidth={1.5} aria-hidden />
              {t(`lan.items.${id}.title`)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Two tracks filling at a speed proportional to the link (10× slowed for the slow one to stay watchable). */
function Race({ gb, lanes }: { gb: number; lanes: { label: string; s: number }[] }) {
  const t = useTranslations("business.fiber.race")
  const slowest = Math.max(...lanes.map((l) => l.s))
  return (
    <div aria-hidden className="flex h-full flex-col justify-center gap-5 px-6 sm:px-8">
      <p className="text-xs text-zinc-400">{t("file", { gb })}</p>
      {lanes.map((l, i) => (
        <div key={l.label} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3">
          <span className="font-mono text-xs text-zinc-300">{l.label}</span>
          <span className="relative h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <span
              className={`biz-race-fill absolute inset-0 rounded-full ${i === lanes.length - 1 ? "bg-gradient-to-r from-[var(--biz-accent)] to-white shadow-[0_0_14px_rgb(167_139_250/0.8)]" : "bg-white/35"}`}
              style={{ "--dur": `${Math.max(0.25, (l.s / slowest) * 6)}s` } as React.CSSProperties}
            />
          </span>
          <span className="text-right font-mono text-xs text-white tabular-nums">{l.s} s</span>
        </div>
      ))}
      <p className="text-[0.7rem] text-zinc-400">{t("theoretical")}</p>
    </div>
  )
}

/** One strand carrying four separated networks. */
function Lanes() {
  const t = useTranslations("business.fiber.lanes")
  const lanes = [
    { k: "admin", c: "#ffffff" },
    { k: "cameras", c: "#c4b5fd" },
    { k: "guests", c: "#a1a1aa" },
    { k: "production", c: "#a78bfa" },
  ] as const
  return (
    <div aria-hidden className="flex h-full flex-col justify-center px-6 sm:px-8">
      <div className="relative overflow-hidden rounded-full border border-white/15 bg-black/40 px-4 py-3">
        {lanes.map((l, i) => (
          <div key={l.k} className="relative flex h-5 items-center">
            <span className="h-px flex-1 opacity-70" style={{ background: `linear-gradient(90deg, transparent, ${l.c} 20%, ${l.c} 80%, transparent)` }} />
            {/* The track (transform-only) carries the packet at its right edge from the strand's start to its end. */}
            <span className="biz-lane-packet absolute inset-y-0 left-0 right-[7.75rem]" style={{ "--d": `${i * 0.55}s` } as React.CSSProperties}>
              <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full" style={{ background: l.c, boxShadow: `0 0 10px ${l.c}` }} />
            </span>
            <span className="ml-3 w-24 shrink-0 text-xs text-zinc-300">{t(l.k)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-[0.7rem] text-zinc-400">{t("strand")}</p>
    </div>
  )
}

/** A wall of simultaneous 8K feeds. */
function Cameras() {
  const t = useTranslations("business.fiber.cams")
  return (
    <div aria-hidden className="grid h-full grid-cols-3 grid-rows-2 gap-2 p-5 sm:p-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="relative overflow-hidden rounded-[3px] border border-white/10 bg-[radial-gradient(120%_90%_at_30%_20%,rgb(167_139_250/0.16),transparent_60%),linear-gradient(160deg,#141420,#09090c)]">
          <span className="absolute top-1.5 left-2 flex items-center gap-1 font-mono text-[0.6rem] text-zinc-300">
            <span className="biz-rec size-1.5 rounded-full bg-red-500" style={{ "--d": `${i * 0.3}s` } as React.CSSProperties} />
            {t("rec")}
          </span>
          <span className="absolute right-2 bottom-1.5 font-mono text-[0.6rem] text-white/70">8K</span>
          <span className="absolute inset-x-3 bottom-5 h-px bg-white/[0.06]" />
        </div>
      ))}
    </div>
  )
}

/** Same strand, upgraded endpoints. */
function Future({ from, to }: { from: number; to: number }) {
  const t = useTranslations("business.fiber.future")
  const row = (label: string, value: string, lit: boolean) => (
    <div className="grid grid-cols-[4rem_auto_1fr_auto] items-center gap-3">
      <span className="text-xs text-zinc-400">{label}</span>
      <span className={`rounded-[3px] border px-2 py-1 font-mono text-xs ${lit ? "border-[var(--biz-accent)] text-white" : "border-white/15 text-zinc-300"}`}>{value}</span>
      <span className={`h-px ${lit ? "bg-gradient-to-r from-[var(--biz-accent)] via-white to-[var(--biz-accent)] shadow-[0_0_10px_rgb(167_139_250/0.7)]" : "bg-white/25"}`} />
      <span className={`rounded-[3px] border px-2 py-1 font-mono text-xs ${lit ? "border-[var(--biz-accent)] text-white" : "border-white/15 text-zinc-300"}`}>{value}</span>
    </div>
  )
  return (
    <div aria-hidden className="flex h-full flex-col justify-center gap-4 px-6 sm:px-8">
      {row(t("today"), `${from}GbE`, false)}
      <p className="pl-[4.75rem] text-center text-[0.7rem] text-zinc-400">↓ {t("same")} ↓</p>
      {row(t("later"), `${to}GbE`, true)}
    </div>
  )
}
