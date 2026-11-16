"use client"

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { useTranslations } from "next-intl"
import { adviceFor, CCR2004_MAX, CCR2116_FROM, LOAD_WARN, SUSTAIN_WARN, type AdviceLevel } from "@/lib/mikrotik/advice"
import { fmtNum } from "@/lib/mikrotik/format"
import type { DeploymentFields } from "@/lib/mikrotik/state"

const ICON: Record<AdviceLevel, { Icon: typeof CheckCircle2; className: string }> = {
  ok: { Icon: CheckCircle2, className: "text-emerald-400" },
  warn: { Icon: AlertTriangle, className: "text-amber-300" },
  bad: { Icon: XCircle, className: "text-rose-400" },
}

const mbps = (v: number) => (v >= 1000 ? `${fmtNum(v / 1000, 1)} Gbps` : `${fmtNum(v, 0)} Mbps`)

/** What would make this deployment better, from its own numbers: capacity, burst rule, router, operations. */
export function AdviceCard({ fields, name }: { fields: DeploymentFields; name: string }) {
  const t = useTranslations("mikrotik.guide.advice")
  const a = adviceFor(fields)
  const items: { key: string; level: AdviceLevel; title: string; body: string[] }[] = [
    {
      key: "capacity",
      level: a.capacity.level,
      title: t("capacity.title"),
      body: [
        t(a.capacity.measured ? "capacity.loadMeasured" : "capacity.load", {
          demand: mbps(a.capacity.demandMbps),
          internet: mbps(a.capacity.internetMbps),
          pct: Number.isFinite(a.capacity.load) ? fmtNum(a.capacity.load * 100, 0) : "—",
          warn: Math.round(LOAD_WARN * 100),
        }),
        ...(a.capacity.planOverLink ? [t("capacity.planOverLink", { plan: mbps(a.capacity.topPlanMbps), link: mbps(a.capacity.biggestLinkMbps) })] : []),
        t("capacity.best"),
        ...(a.capacity.measured ? [] : [t("capacity.measure")]),
      ],
    },
    {
      key: "exit",
      level: a.exit.level,
      title: t("exit.title"),
      body:
        a.exit.natLinks.length === 0
          ? [t("exit.ok")]
          : [
              t(a.exit.level === "bad" ? "exit.all" : "exit.some", { links: a.exit.natLinks.join(", "), count: a.exit.natLinks.length }),
              t("exit.limits"),
              t("exit.trace"),
              t("exit.best"),
            ],
    },
    {
      key: "burst",
      level: a.burst.level,
      title: t("burst.title"),
      body: [
        t(a.burst.level === "ok" ? "burst.ok" : "burst.low", { pct: a.burst.sustainedPct, plan: mbps(a.burst.topPlanMbps), sustained: mbps(a.burst.sustainedMbps), min: Math.round(SUSTAIN_WARN * 100) }),
        t("burst.legal"),
      ],
    },
    {
      key: "router",
      level: a.router.level,
      title: t("router.title"),
      body: [t(`router.${a.router.model}`, { clients: fmtNum(a.router.clients, 0), demand: mbps(a.router.demandMbps), small: CCR2004_MAX, big: CCR2116_FROM }), t("router.why")],
    },
    {
      key: "ops",
      level: a.ops.level,
      title: t("ops.title"),
      body: [
        ...(a.ops.alerts ? [] : [t("ops.noAlerts")]),
        ...(a.ops.backupOff ? [t("ops.backupLocal")] : []),
        ...(a.ops.snmp ? [] : [t("ops.noSnmp")]),
        t("ops.spare"),
        t("ops.version"),
      ],
    },
  ]
  return (
    <section aria-labelledby="advice-title" className="surface grid gap-5 rounded-2xl p-5 sm:p-6">
      <div className="grid gap-1.5">
        <h3 id="advice-title" className="text-base font-medium text-foreground">
          {t("title", { name })}
        </h3>
        <p className="max-w-3xl text-sm leading-relaxed text-zinc-400">{t("lead")}</p>
      </div>
      <ul className="grid gap-5 lg:grid-cols-2">
        {items.map(({ key, level, title, body }) => {
          const { Icon, className } = ICON[level]
          return (
            <li key={key} className="grid content-start gap-2 rounded-xl border border-white/10 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                <Icon aria-hidden className={`size-4 shrink-0 ${className}`} />
                {title}
                <span className="sr-only">· {t(`levels.${level}`)}</span>
              </p>
              {body.map((line, k) => (
                <p key={k} className="text-sm leading-relaxed text-zinc-400">
                  {line}
                </p>
              ))}
            </li>
          )
        })}
      </ul>
      <p className="max-w-3xl text-xs leading-snug text-zinc-500">{t("sources")}</p>
    </section>
  )
}
