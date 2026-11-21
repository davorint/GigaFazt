"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { GRID, PickField } from "@/components/surveys/SurveyFields"
import { configCounts, planShape, type AsterPlan } from "@/lib/asternos/config"
import { burstSeconds, hasBurst, PRESETS, rechargeSeconds, simulateClient, SITUATIONS, type PresetId } from "@/lib/asternos/plan"
import { maxGrowth, simulateBusyHour } from "@/lib/asternos/busy"
import { priorityDelayMs, queueDelayMs } from "@/lib/asternos/classes"
import { sizing, type Platform } from "@/lib/asternos/sizing"
import { useAsterDeployment } from "./useAsterDeployment"

const TABS = ["design", "busy", "classes", "hardware"] as const
type Tab = (typeof TABS)[number]
const CARD = "grid gap-3 rounded-xl border border-white/10 p-4"
const SMALL = "inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const TH = "px-3 py-2 text-left font-mono text-[0.7rem] font-normal uppercase tracking-wide text-zinc-400"
const TD = "px-3 py-2 text-right font-mono tabular-nums text-zinc-100"
const r1 = (x: number) => Math.round(x * 10) / 10
const pct = (x: number) => `${Math.round(x * 100)} %`
/** Milliseconds, with "<0.1" for what rounds to zero. */
const ms = (x: number) => (x < 0.05 ? "<0.1 ms" : `${r1(x)} ms`)

/** Simulador AsterNOS (owner, 2026-11-20): plans, busy hour, priority classes and hardware, with the guide's deployment. */
export function AsterSimulator() {
  const t = useTranslations("asternos.sim")
  const [tab, setTab] = useState<Tab>("design")
  return (
    <div className="mt-8 grid gap-6">
      <div role="tablist" aria-label={t("tabsLabel")} className="flex flex-wrap gap-1 rounded-xl border border-white/10 p-1">
        {TABS.map((k) => (
          <button
            key={k}
            role="tab"
            type="button"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:text-foreground aria-selected:bg-white/10 aria-selected:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={t(`tabs.${tab}`)}>
        {tab === "design" && <Design />}
        {tab === "busy" && <Busy />}
        {tab === "classes" && <Classes />}
        {tab === "hardware" && <Hardware />}
      </div>
    </div>
  )
}

// ── Plan designer ──────────────────────────────────────────────────────────

function Design() {
  const t = useTranslations("asternos.sim.design")
  const [d, set] = useAsterDeployment()
  const [k, setK] = useState(0)
  const [situation, setSituation] = useState(SITUATIONS[0].id)
  const i = Math.min(k, d.plans.length - 1)
  const plan = d.plans[i]
  const sh = plan ? planShape(plan) : null
  const runs = useMemo(() => (sh ? SITUATIONS.map((s) => ({ s, run: simulateClient(sh, s.pattern, s.runS) })) : []), [sh?.peakMbps, sh?.sustainedMbps, sh?.burstMB, sh?.rechargeMbps]) // eslint-disable-line react-hooks/exhaustive-deps -- recompute only when the plan's shape changes
  if (!plan || !sh) return <p className="text-sm text-zinc-400">{t("noPlans")}</p>
  const up = (p: Partial<AsterPlan>) => set({ plans: d.plans.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const preset = (id: PresetId) => {
    const s = PRESETS[id](plan.mbps)
    up({ sustainedMbps: r1(s.sustainedMbps), burstMB: s.burstMB, rechargeMbps: r1(s.rechargeMbps) })
  }
  const chosen = runs.find((x) => x.s.id === situation) ?? runs[0]
  return (
    <div className="grid gap-5">
      <div className={GRID}>
        <PickField label={t("plan")} value={String(i)} onChange={(v: string) => setK(Number(v))} options={d.plans.map((p, j) => ({ value: String(j), label: `${p.name} (${p.mbps} Mbps)` }))} />
      </div>
      <section className={CARD} aria-label={t("shape")}>
        <h2 className="text-base font-medium text-foreground">{t("shape")}</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <button key={id} type="button" onClick={() => preset(id)} className={SMALL}>
              {t(`presets.${id}`)}
            </button>
          ))}
        </div>
        <div className={GRID}>
          <NumberField label={t("peak")} unit="Mbps" min={1} max={100000} value={plan.mbps} onChange={(v) => up({ mbps: v ?? 1 })} hint={t("peakHint")} />
          <NumberField label={t("sustained")} unit="Mbps" min={0.1} max={plan.mbps} value={plan.sustainedMbps} onChange={(v) => up({ sustainedMbps: v ?? plan.mbps })} hint={t("sustainedHint")} />
          <NumberField label={t("burst")} unit="MB" min={0} max={4000} value={plan.burstMB} onChange={(v) => up({ burstMB: v ?? 0 })} hint={t("burstHint")} />
          <NumberField label={t("recharge")} unit="Mbps" min={0.1} max={Math.max(0.1, plan.sustainedMbps)} value={plan.rechargeMbps} onChange={(v) => up({ rechargeMbps: v ?? plan.sustainedMbps })} hint={d.design === "single" ? t("rechargeSingle") : t("rechargeHint")} />
        </div>
        <p className="text-sm text-zinc-200">
          {hasBurst(sh) ? t("summary", { peak: sh.peakMbps, seconds: r1(burstSeconds(sh)), sustained: sh.sustainedMbps, recharge: r1(rechargeSeconds(sh)) }) : t("plain", { peak: sh.peakMbps })}
        </p>
      </section>

      <section className={CARD} aria-label={t("results")}>
        <h2 className="text-base font-medium text-foreground">{t("results")}</h2>
        <div tabIndex={0} role="region" aria-label={t("results")} className="overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className={TH}>{t("cols.situation")}</th>
                <th className={`${TH} text-right`}>{t("cols.result")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(({ s, run }) => (
                <tr key={s.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2 text-zinc-100">{t(`situations.${s.id}`)}</td>
                  <td className={TD}>{resultText(t, s.id, run, s.runS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={GRID}>
          <PickField label={t("chartOf")} value={situation} onChange={setSituation} options={SITUATIONS.map((s) => ({ value: s.id, label: t(`situations.${s.id}`) }))} />
        </div>
        {chosen && <Chart series={chosen.run.series} peak={sh.peakMbps} sustained={sh.sustainedMbps} label={t("chartLabel", { situation: t(`situations.${chosen.s.id}`) })} />}
      </section>
    </div>
  )
}

function resultText(t: ReturnType<typeof useTranslations>, id: string, run: ReturnType<typeof simulateClient>, runS: number): string {
  const x = run.transfer
  if (id === "speedtest") return t("res.speedtest", { mbps: Math.round(run.totalMb / 15) })
  if (id === "dl100" || id === "dl1000") return x?.finishS != null ? t("res.download", { s: r1(x.finishS) }) : t("res.notDone")
  if (id === "web") return x?.meanS != null ? t("res.web", { ms: Math.round(x.meanS * 1000) }) : "—"
  if (id === "video4k") return t("res.video", { start: r1(x?.startupS ?? 0), stall: r1(x?.stallS ?? 0) })
  return t("res.average", { mbps: Math.round(run.totalMb / runS), burst: r1(run.burstS) })
}

/** Speed over time with the peak and sustained lines (inline SVG; text equivalent in its label). */
function Chart({ series, peak, sustained, label }: { series: { t: number; mbps: number }[]; peak: number; sustained: number; label: string }) {
  const W = 640
  const H = 200
  const maxT = series.length ? series[series.length - 1].t + 0.5 : 1
  const maxY = Math.max(peak, ...series.map((p) => p.mbps)) * 1.1 || 1
  const x = (v: number) => (v / maxT) * W
  const y = (v: number) => H - (v / maxY) * H
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.mbps).toFixed(1)}`).join(" ")
  return (
    <figure className="grid gap-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-48 w-full rounded-lg border border-white/10 bg-black/30">
        <line x1={0} x2={W} y1={y(peak)} y2={y(peak)} stroke="currentColor" className="text-zinc-500" strokeDasharray="4 4" />
        <line x1={0} x2={W} y1={y(sustained)} y2={y(sustained)} stroke="currentColor" className="text-amber-300/70" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-cyan-300" />
      </svg>
      <figcaption className="text-xs text-zinc-400">{label}</figcaption>
    </figure>
  )
}

// ── Busy hour ──────────────────────────────────────────────────────────────

function Busy() {
  const t = useTranslations("asternos.sim.busy")
  const [d, set] = useAsterDeployment()
  const [active, setActive] = useState(25)
  const [demand, setDemand] = useState(100)
  const [target, setTarget] = useState(80)
  const capacity = d.carriers.reduce((a, c) => a + (c.mbps || 0), 0)
  const input = useMemo(
    () => ({
      plans: d.plans.map((p) => ({ name: p.name, clients: p.clients, capMbps: planShape(p).sustainedMbps, peakMbps: p.mbps, groupMbps: null })),
      capacityMbps: capacity,
      activeShare: active / 100,
      demandShare: demand / 100,
    }),
    [d.plans, capacity, active, demand]
  )
  const res = useMemo(() => simulateBusyHour(input), [input])
  const growth = useMemo(() => maxGrowth(input, target / 100), [input, target])
  const clients = d.plans.reduce((a, p) => a + p.clients, 0)
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("what")}</p>
      <section className={CARD} aria-label={t("inputs")}>
        <div className={GRID}>
          {d.plans.map((p, i) => (
            <NumberField key={i} label={t("clientsOf", { plan: p.name })} unit={t("clientsUnit")} integer min={0} max={50000} value={p.clients} onChange={(v) => set({ plans: d.plans.map((x, j) => (j === i ? { ...x, clients: v ?? 0 } : x)) })} />
          ))}
          <NumberField label={t("active")} unit="%" min={1} max={100} value={active} onChange={(v) => setActive(v ?? 25)} hint={t("activeHint")} />
          <NumberField label={t("demand")} unit="%" min={1} max={100} value={demand} onChange={(v) => setDemand(v ?? 100)} hint={t("demandHint")} />
          <NumberField label={t("target")} unit="%" min={10} max={100} value={target} onChange={(v) => setTarget(v ?? 80)} hint={t("targetHint")} />
        </div>
        <p className="text-xs text-zinc-400">{t("capacity", { mbps: capacity })}</p>
      </section>
      {clients === 0 || capacity === 0 ? (
        <p className="text-sm text-amber-200">{t("needData")}</p>
      ) : (
        <section className={CARD} aria-label={t("results")}>
          <div tabIndex={0} role="region" aria-label={t("results")} className="overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className={TH}>{t("cols.plan")}</th>
                  <th className={`${TH} text-right`}>{t("cols.typical")}</th>
                  <th className={`${TH} text-right`}>{t("cols.bad")}</th>
                  <th className={`${TH} text-right`}>{t("cols.test")}</th>
                </tr>
              </thead>
              <tbody>
                {res.plans.map((p) => (
                  <tr key={p.name} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-zinc-100">{p.name}</td>
                    <td className={TD}>
                      {`${Math.round(p.p50Mbps)} Mbps`}
                      <span className="block text-xs text-zinc-400">{pct(p.p50)}</span>
                    </td>
                    <td className={`${TD} ${p.p5 < target / 100 ? "text-amber-200" : ""}`}>
                      {`${Math.round(p.p5Mbps)} Mbps`}
                      <span className="block text-xs text-zinc-400">{pct(p.p5)}</span>
                    </td>
                    <td className={TD}>{`${Math.round(p.testMbps)} Mbps`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-1 text-sm text-zinc-200">
            <li>{t("load", { p50: pct(res.load50), p95: pct(res.load95) })}</li>
            <li>{t("saturated", { pct: pct(res.saturated) })}</li>
            <li>{t("over", { x: r1(res.oversubscription) })}</li>
            <li className={growth < 1 ? "text-amber-200" : "text-emerald-300"}>{growth < 1 ? t("growthShort", { n: Math.floor(clients * growth), target }) : t("growth", { n: Math.floor(clients * growth), x: r1(growth), target })}</li>
          </ul>
          <p className="text-xs text-zinc-400">{t("model")}</p>
        </section>
      )}
    </div>
  )
}

// ── Priority classes ───────────────────────────────────────────────────────

function Classes() {
  const t = useTranslations("asternos.sim.classes")
  const [d, set] = useAsterDeployment()
  const [queue, setQueue] = useState(64)
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("what")}</p>
      <section className={CARD} aria-label={t("inputs")}>
        <div className={GRID}>
          <NumberField label={t("queue")} unit={t("packets")} integer min={1} max={10000} value={queue} onChange={(v) => setQueue(v ?? 64)} hint={t("queueHint")} />
        </div>
        <div tabIndex={0} role="region" aria-label={t("table")} className="overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <table className="w-full min-w-[28rem] text-sm">
            <caption className="px-3 pt-2 text-left text-xs text-zinc-400">{t("table")}</caption>
            <thead>
              <tr className="border-b border-white/10">
                <th className={TH}>{t("cols.plan")}</th>
                <th className={`${TH} text-right`}>{t("cols.without")}</th>
                <th className={`${TH} text-right`}>{t("cols.with")}</th>
              </tr>
            </thead>
            <tbody>
              {d.plans.map((p, i) => {
                const sh = planShape(p)
                return (
                  <tr key={i} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 text-zinc-100">{t("atSustained", { plan: p.name, mbps: sh.sustainedMbps })}</td>
                    <td className={`${TD} text-amber-200`}>{ms(queueDelayMs(queue, sh.sustainedMbps))}</td>
                    <td className={`${TD} text-emerald-300`}>{ms(priorityDelayMs(sh.sustainedMbps))}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
          <input type="checkbox" checked={d.classes} disabled={d.design !== "two-stage"} onChange={(e) => set({ classes: e.target.checked })} className="size-5 accent-white" />
          {t("enable")}
        </label>
        <p className="text-xs text-zinc-400">{d.design === "two-stage" ? t("how") : t("needTwoStage")}</p>
      </section>
    </div>
  )
}

// ── Hardware ───────────────────────────────────────────────────────────────

function Hardware() {
  const t = useTranslations("asternos.sim.hardware")
  const [d] = useAsterDeployment()
  const [platform, setPlatform] = useState<Platform>("et2508")
  const [cores, setCores] = useState(8)
  const [ram, setRam] = useState(16)
  const [etRam, setEtRam] = useState(16)
  const [packet, setPacket] = useState(800)
  const [sessions, setSessions] = useState(150)
  const capacity = d.carriers.reduce((a, c) => a + (c.mbps || 0), 0)
  const [peak, setPeak] = useState<number | null>(null)
  const counts = configCounts(d)
  const clients = d.plans.reduce((a, p) => a + p.clients, 0) || counts.hosts
  const traffic = peak ?? capacity * 2
  const res = sizing({ platform, vmCores: cores, vmRamGB: ram, et2508RamGB: etRam, peakMbps: traffic, avgPacketBytes: packet, clients, sessionsPerClient: sessions, aclRules: counts.aclRules, policers: counts.policers, hqosUsers: counts.hqosUsers })
  const tone = { ok: "text-emerald-300", warn: "text-amber-200", bad: "text-red-300", info: "text-zinc-200" } as const
  return (
    <div className="grid gap-5">
      <p className="text-sm text-zinc-300">{t("what")}</p>
      <section className={CARD} aria-label={t("inputs")}>
        <div className={GRID}>
          <PickField label={t("platform")} value={platform} onChange={(v: Platform) => setPlatform(v)} options={(["et2508", "vm"] as const).map((p) => ({ value: p, label: t(`platforms.${p}`) }))} />
          {platform === "vm" ? (
            <>
              <NumberField label={t("cores")} unit={t("coresUnit")} integer min={1} max={256} value={cores} onChange={(v) => setCores(v ?? 4)} />
              <NumberField label={t("ram")} unit="GB" integer min={1} max={1024} value={ram} onChange={(v) => setRam(v ?? 4)} />
            </>
          ) : (
            <NumberField label={t("ram")} unit="GB" integer min={16} max={48} value={etRam} onChange={(v) => setEtRam(v ?? 16)} hint={t("etRamHint")} />
          )}
          <NumberField label={t("traffic")} unit="Mbps" optional min={0} max={1e6} value={peak} onChange={setPeak} hint={t("trafficHint", { mbps: capacity * 2 })} />
          <NumberField label={t("packet")} unit="bytes" integer min={64} max={1500} value={packet} onChange={(v) => setPacket(v ?? 800)} hint={t("packetHint")} />
          <NumberField label={t("sessions")} unit={t("sessionsUnit")} integer min={1} max={10000} value={sessions} onChange={(v) => setSessions(v ?? 150)} hint={t("sessionsHint")} />
        </div>
      </section>
      <section className={CARD} aria-label={t("results")}>
        <ul className="grid gap-2">
          {res.checks.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm">
              <span className="text-zinc-100">{t(`checks.${c.id}`)}</span>
              <span className={`font-mono ${tone[c.level]}`}>
                {c.limit === null ? t("valueOnly", { value: c.value.toLocaleString("es-MX") }) : t("valueOf", { value: Number.isInteger(c.value) ? c.value.toLocaleString("es-MX") : r1(c.value), limit: Number.isInteger(c.limit) ? c.limit.toLocaleString("es-MX") : r1(c.limit) })}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-zinc-200">{t("mpps", { mpps: r1(res.mpps) })}</p>
        {res.estimated && <p className="text-xs text-amber-200">{t("estimated", { gbps: r1(res.gbps) })}</p>}
        <p className="text-xs text-zinc-400">{t("sources")}</p>
      </section>
    </div>
  )
}
