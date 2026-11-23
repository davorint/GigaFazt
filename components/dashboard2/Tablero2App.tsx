"use client"

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { localToday } from "@/lib/clients/from-lead"
import { demoSet } from "@/lib/interno/dashboard-demo"
import type { NetworkFigures } from "@/lib/interno/dashboard-server"
import { lastMonths, monthNumbers } from "@/lib/interno/numbers"
import { forecast } from "@/lib/interno/outlook"
import { cohorts, moneyFlow, mrrAt, mrrBridge, networkGroups, payCalendar, payWindow, retentionAt, TONES, type FlowKind, type RingGroup, type Tone } from "@/lib/interno/tablero2"
import { mxn } from "@/lib/materials/catalog"
import { addMonths } from "@/lib/payments/model"
import { FULL_SHARE } from "@/lib/wispdavor/capacity"
import { useWispData } from "@/components/wispdavor/useWispData"
import { Panel } from "@/components/dashboard/Panel"
import { SERIES } from "@/components/dashboard/theme"
import { CapacityBars } from "./CapacityBars"
import { CohortGrid } from "./CohortGrid"
import { k, monthName, pct, pesos, short, signed } from "./format"
import { MoneySankey } from "./MoneySankey"
import { MovesChart } from "./MovesChart"
import { MrrWaterfall } from "./MrrWaterfall"
import { NetworkRings, TONE_COLOR } from "./NetworkRings"
import { PayCalendar, PayDays } from "./PayCalendar"
import { RadialClock } from "./RadialClock"
import { RevenueChart } from "./RevenueChart"
import { Spark } from "./Spark"

const PERIODS = [6, 12, 24] as const
/** The hour now in Mexico City (the traffic heat is in that zone). */
const hourInMexico = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hourCycle: "h23" }).format(new Date()))

function Kpi({ label, value, hint, trend, color, demo }: { label: string; value: string; hint: string; trend: (number | null)[]; color: string; demo: string }) {
  return (
    <div className="grid content-between gap-1 rounded-2xl border border-white/10 bg-[#0e0e10] p-4">
      <p className="flex items-center justify-between gap-2 text-xs text-zinc-400">
        {label}
        {demo && <span className="rounded border border-amber-300/50 px-1 font-mono text-[0.6rem] tracking-wide text-amber-200">{demo}</span>}
      </p>
      <p className="text-3xl font-light tracking-tight text-zinc-50 tabular-nums">{value}</p>
      <p className="text-xs text-zinc-400">{hint}</p>
      <Spark values={trend} color={color} label={`${label}: ${value}. ${hint}`} />
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="flex items-center gap-3 text-lg font-light text-foreground">
        {title}
        <span aria-hidden className="h-px flex-1 bg-gradient-to-r from-white/15 to-transparent" />
      </h2>
      {children}
    </section>
  )
}

/**
 * /interno/admin/tablero2 (owner, 2026-11-22: a new iteration of the Tablero with D3, "something truly amazing"; same
 * look as the Tablero): the living network, the money as it flows (Sankey), the recurring revenue bridge, billed vs
 * collected with the forecast, client moves and cohorts, the network's 24-hour clock, links at the busy hour and when
 * people pay. Same records and network figures as the Tablero, same "Datos simulados" switch.
 */
export function Tablero2App() {
  const t = useTranslations("tablero2")
  const d = useWispData()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(12)
  const [net, setNet] = useState<NetworkFigures | null | "error">(null)
  const [demo, setDemo] = useState(false)
  const [nowHour, setNowHour] = useState<number | null>(null)
  const today = d.loaded ? localToday() : ""
  const sim = useMemo(() => (demo && today ? demoSet(today) : null), [demo, today])
  const src = useMemo(() => sim ?? { clients: d.clients, payments: d.payments, sites: d.sites }, [sim, d.clients, d.payments, d.sites])

  useEffect(() => {
    let live = true
    fetch("/api/interno/tablero", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { network?: NetworkFigures }
        if (live) setNet(r.ok && b.network ? b.network : "error")
      })
      .catch(() => live && setNet("error"))
    const tick = () => setNowHour(hourInMexico())
    tick()
    const id = window.setInterval(tick, 60_000)
    return () => {
      live = false
      window.clearInterval(id)
    }
  }, [])

  const cur = today.slice(0, 7)
  const months = useMemo(() => (cur ? lastMonths(cur, period) : []), [cur, period])
  const year = useMemo(() => (cur ? lastMonths(cur, 12) : []), [cur])
  const rows = useMemo(() => (d.loaded ? monthNumbers(src.clients, src.payments, [], months) : []), [d.loaded, src, months])
  const yearRows = useMemo(() => (d.loaded ? monthNumbers(src.clients, src.payments, [], year) : []), [d.loaded, src, year])
  const fc = useMemo(() => (yearRows.length ? forecast(src.clients, yearRows, cur) : null), [yearRows, src, cur])
  const flow = useMemo(() => moneyFlow(src.sites, src.clients), [src])
  const bridge = useMemo(() => (months.length ? mrrBridge(src.clients, addMonths(months[0], -1), cur) : null), [src, months, cur])
  const mrrYear = useMemo(() => year.map((m) => Math.round(src.clients.reduce((a, c) => a + mrrAt(c, m), 0))), [src, year])
  const cohortRows = useMemo(() => cohorts(src.clients, months), [src, months])
  // Kept at 3 months over the trailing window that ends each month of the year (the KPI's trend).
  const r3Trend = useMemo(() => year.map((m) => { const v = retentionAt(cohorts(src.clients, lastMonths(m, Math.min(period, 12))), 3); return v === null ? null : Math.round(v * 1000) / 10 }), [src, year, period])
  const groups = useMemo(() => (today ? networkGroups(src.sites, src.clients, src.payments, today) : []), [src, today])
  const cal = useMemo(() => (today ? payCalendar(src.payments, today, 26) : null), [src, today])
  const nodeName = useCallback((kind: FlowKind, label: string) => (kind === "plan" || kind === "site" ? label : t(`flow.nodes.${kind}`)), [t])
  const groupName = useCallback((g: RingGroup) => g.name || t("rings.noSite"), [t])
  const toneLabel = useCallback((x: Tone) => t(`rings.tones.${x}`), [t])

  if (!d.loaded || !fc || !bridge || !cal || !rows.length) return <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>

  const tag = sim ? t("demo.tag") : ""
  const tl = t("table")
  const network = sim ? sim.network : net && net !== "error" ? net : null
  const now = yearRows[yearRows.length - 1]
  const days = t.raw("clock.days") as string[]

  // KPIs
  const mrrNow = mrrYear[mrrYear.length - 1] ?? 0
  const mrrPrev = mrrYear[mrrYear.length - 2] ?? 0
  const r3 = retentionAt(cohortRows, 3)
  const r6 = retentionAt(cohortRows, 6)

  // The living network
  const live = groups.reduce((a, g) => a + g.clients.length, 0)
  const toneCount = (x: Tone) => groups.reduce((a, g) => a + g.clients.filter((c) => c.tone === x).length, 0)
  const sitesWithClients = groups.filter((g) => g.id).length

  // Money
  const revenue = rows.map((r) => ({ month: r.month, billed: r.expected, collected: r.collected }))
  const fan = fc.rows.map((r) => ({ month: r.month, low: r.withChurn, high: r.scheduled }))
  const delta = Math.round((bridge.end - bridge.start) * 100) / 100

  // Clients
  const moves = rows.map((r) => ({ month: r.month, added: r.newServices, lost: r.cancelled }))
  const added = moves.reduce((a, m) => a + m.added, 0)
  const lost = moves.reduce((a, m) => a + m.lost, 0)

  // Network
  let peak: { d: number; h: number; v: number } | null = null
  if (network) network.heat.forEach((row, di) => row.forEach((v, h) => v !== null && (!peak || v > peak.v) && (peak = { d: di, h, v })))
  const pk = peak as { d: number; h: number; v: number } | null
  const capRows = network ? network.sites.filter((s) => s.use !== null).map((s) => ({ name: s.name, use: s.use ?? 0, busy: s.busyDown, speed: s.speedDown })).sort((a, b) => b.use - a.use) : []

  // Collections
  const win = payWindow(cal.byDayOfMonth)

  return (
    <div className="mt-6 grid gap-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-300">{t("lead")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" role="switch" aria-checked={demo} onClick={() => setDemo((x) => !x)} className="inline-flex min-h-9 items-center gap-2 rounded-full border border-white/10 py-1 pr-3 pl-1 text-xs text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <span aria-hidden className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors ${demo ? "bg-amber-300" : "bg-white/15"}`}>
              <span className={`absolute top-0.5 left-0 size-4 rounded-full bg-white transition-transform motion-reduce:transition-none ${demo ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
            {t("demo.toggle")}
          </button>
          <div role="group" aria-label={t("period")} className="flex gap-1 rounded-full border border-white/10 p-1">
            {PERIODS.map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={`min-h-9 rounded-full px-3 text-xs focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${period === p ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/5"}`}>
                {t("months", { n: p })}
              </button>
            ))}
          </div>
        </div>
      </div>
      {sim && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300/50 bg-amber-300/[0.06] p-3 text-sm text-amber-100">
          <span className="rounded border border-amber-300/60 px-1.5 py-0.5 font-mono text-[0.7rem] tracking-wide">{t("demo.tag")}</span>
          {t("demo.banner")}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Panel
          demo={tag}
          title={t("rings.title")}
          takeaway={live ? t("rings.takeaway", { n: live, sites: sitesWithClients, late: toneCount("atrasado"), sus: toneCount("suspendido") }) : undefined}
          empty={live ? null : t("empty.clients")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("cols.clients"), ...TONES.map((x) => t(`rings.tones.${x}`))], rows: groups.map((g) => [groupName(g), g.clients.length, ...TONES.map((x) => g.clients.filter((c) => c.tone === x).length)]) }}
        >
          <NetworkRings groups={groups} label={t("rings.title")} center={String(live)} centerHint={t("rings.center")} name={groupName} toneLabel={toneLabel} />
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-xs text-zinc-300">
            {TONES.map((x) => (
              <li key={x} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: TONE_COLOR[x] }} />
                {t(`rings.tones.${x}`)} <span className="font-mono tabular-nums text-zinc-100">{toneCount(x)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.7rem] text-zinc-500">{t("rings.note")}</p>
        </Panel>
        <section aria-label={t("kpi.title")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Kpi demo={tag} label={t("kpi.mrr")} value={pesos(mrrNow)} hint={t("kpi.mrrHint", { d: `${mrrNow - mrrPrev >= 0 ? "+" : "−"}${pesos(Math.abs(mrrNow - mrrPrev))}` })} trend={mrrYear} color={SERIES[0]} />
          <Kpi demo={tag} label={t("kpi.collected")} value={pesos(now.collected)} hint={t("kpi.collectedHint", { pct: pct(now.rate), billed: pesos(now.expected) })} trend={yearRows.map((r) => r.collected)} color={SERIES[1]} />
          <Kpi demo={tag} label={t("kpi.profit")} value={pesos(flow.profit)} hint={t("kpi.profitHint", { income: k(flow.income), costs: k(flow.costs) })} trend={[]} color={SERIES[2]} />
          <Kpi demo={tag} label={t("kpi.retention")} value={pct(r3)} hint={r3 === null ? t("kpi.retentionNone") : t("kpi.retentionHint")} trend={r3Trend} color={SERIES[3]} />
        </section>
      </div>

      <Section id="t2-money" title={t("sections.money")}>
        <Panel
          demo={tag}
          title={t("flow.title")}
          takeaway={flow.income ? (flow.profit < 0 ? t("flow.takeawayLoss", { income: mxn(flow.income), costs: mxn(flow.costs), short: mxn(-flow.profit) }) : t("flow.takeaway", { income: mxn(flow.income), costs: mxn(flow.costs), profit: mxn(flow.profit), margin: pct(flow.income ? flow.profit / flow.income : null) })) : undefined}
          empty={flow.links.length ? null : t("empty.flow")}
          tableLabel={tl}
          table={{ head: [t("flow.from"), t("flow.to"), t("cols.amount")], rows: flow.links.map((l) => { const n = (id: string) => flow.nodes.find((x) => x.id === id); const s = n(l.source); const d2 = n(l.target); return [s ? nodeName(s.kind, s.label) : "", d2 ? nodeName(d2.kind, d2.label) : "", mxn(l.value)] }) }}
        >
          <MoneySankey flow={flow} label={t("flow.title")} name={nodeName} />
          <p className="text-[0.7rem] text-zinc-500">{t("flow.note")}</p>
        </Panel>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            demo={tag}
            title={t("revenue.title")}
            takeaway={t("revenue.takeaway", { month: monthName(now.month), rate: pct(now.rate), low: mxn(fan[0]?.low ?? 0), high: mxn(fan[0]?.high ?? 0) })}
            tableLabel={tl}
            table={{ head: [t("cols.month"), t("revenue.billed"), t("revenue.collected")], rows: [...revenue.map((r) => [short(r.month), mxn(r.billed), mxn(r.collected)]), ...fan.map((f) => [`${short(f.month)} · ${t("revenue.estimate")}`, `${mxn(f.low)} – ${mxn(f.high)}`, "—"])] }}
          >
            <RevenueChart rows={revenue} forecast={fan} label={t("revenue.title")} names={{ billed: t("revenue.billed"), collected: t("revenue.collected"), rate: t("revenue.rate"), low: t("revenue.low"), high: t("revenue.high") }} estimate={t("revenue.estimate")} />
            <Legend items={[[t("revenue.billed"), SERIES[0], "line"], [t("revenue.collected"), SERIES[1], "area"], [`${t("revenue.low")} – ${t("revenue.high")}`, SERIES[0], "band"]]} />
          </Panel>
          <Panel
            demo={tag}
            title={t("bridge.title")}
            takeaway={t(delta ? "bridge.takeaway" : "bridge.takeawaySame", { from: short(bridge.from), dir: delta > 0 ? t("bridge.up") : t("bridge.down"), amount: mxn(Math.abs(delta)), added: `+${mxn(bridge.added)}`, more: `+${mxn(bridge.more)}`, less: `−${mxn(bridge.less)}`, lost: `−${mxn(bridge.lost)}` })}
            tableLabel={tl}
            table={{ head: [t("cols.concept"), t("cols.clients"), t("cols.amount")], rows: [[`${t("bridge.start")} (${short(bridge.from)})`, "—", mxn(bridge.start)], [t("bridge.added"), bridge.counts.added, `+${mxn(bridge.added)}`], [t("bridge.more"), bridge.counts.more, `+${mxn(bridge.more)}`], [t("bridge.less"), bridge.counts.less, `−${mxn(bridge.less)}`], [t("bridge.lost"), bridge.counts.lost, `−${mxn(bridge.lost)}`], [t("bridge.end"), "—", mxn(bridge.end)]] }}
          >
            <MrrWaterfall bridge={bridge} label={t("bridge.title")} labels={{ start: t("bridge.start"), added: t("bridge.added"), more: t("bridge.more"), less: t("bridge.less"), lost: t("bridge.lost"), end: t("bridge.end") }} hint={(_, n) => t("bridge.clients", { n })} />
          </Panel>
        </div>
      </Section>

      <Section id="t2-clients" title={t("sections.clients")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel demo={tag} title={t("moves.title")} takeaway={t("moves.takeaway", { added, lost, months: period, net: signed(added - lost) })} tableLabel={tl} table={{ head: [t("cols.month"), t("moves.added"), t("moves.lost"), t("moves.net")], rows: moves.map((m) => [short(m.month), m.added, m.lost, signed(m.added - m.lost)]) }}>
            <MovesChart rows={moves} label={t("moves.title")} names={{ added: t("moves.added"), lost: t("moves.lost"), net: t("moves.net") }} />
            <Legend items={[[t("moves.added"), SERIES[0], "bar"], [t("moves.lost"), SERIES[1], "bar"]]} />
          </Panel>
          <Panel
            demo={tag}
            title={t("cohorts.title")}
            takeaway={r3 === null ? t("cohorts.takeawayShort") : t("cohorts.takeaway", { r3: pct(r3), r6: pct(r6) })}
            empty={cohortRows.some((r) => r.size) ? null : t("empty.cohorts")}
            tableLabel={tl}
            table={{ head: [t("cols.month"), t("cols.clients"), ...months.map((_, i) => t("cohorts.age", { k: i }))], rows: cohortRows.filter((r) => r.size).map((r) => [short(r.month), r.size, ...r.cells.map((v) => (v === null ? "—" : pct(v)))]) }}
          >
            <CohortGrid rows={cohortRows} label={t("cohorts.title")} ageLabel={(kk) => t("cohorts.age", { k: kk })} sizeLabel={t("cohorts.size")} tipTitle={(m, kk) => t("cohorts.tip", { month: short(m), k: kk })} tipKept={t("cohorts.kept")} />
            <p className="text-[0.7rem] text-zinc-500">{t("cohorts.note")}</p>
          </Panel>
        </div>
      </Section>

      <Section id="t2-network" title={t("sections.network")}>
        {net === "error" && !sim && <p className="text-xs text-amber-200">{t("offline")}</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            demo={tag}
            title={t("clock.title")}
            takeaway={network?.hasTraffic && pk ? t("clock.takeaway", { day: days[pk.d], h: pk.h, v: Math.round(pk.v).toLocaleString("es-MX") }) : undefined}
            empty={network?.hasTraffic ? null : t("empty.traffic")}
            tableLabel={tl}
            table={network ? { head: [t("cols.day"), ...Array.from({ length: 24 }, (_, h) => `${h}h`)], rows: network.heat.map((r, i) => [days[i], ...r.map((v) => (v === null ? "—" : v))]) } : undefined}
          >
            {network && <RadialClock heat={network.heat} label={t("clock.title")} days={days} nowHour={nowHour} peakLabel={t("clock.peak")} unit={t("clock.unit")} noData={t("clock.noData")} />}
            <p className="text-[0.7rem] text-zinc-500">{t("clock.note")}</p>
          </Panel>
          <Panel
            demo={tag}
            title={t("capacity.title")}
            takeaway={capRows[0] ? t("capacity.takeaway", { site: capRows[0].name, use: pct(capRows[0].use) }) : undefined}
            empty={capRows.length ? null : t("empty.capacity")}
            tableLabel={tl}
            table={{ head: [t("cols.site"), t("cols.use"), "Mbps"], rows: capRows.map((r) => [r.name, pct(r.use), r.busy === null || r.speed === null ? "—" : `${r.busy} / ${r.speed}`]) }}
          >
            <CapacityBars rows={capRows} full={FULL_SHARE} fullLabel={t("capacity.full")} detail={(r) => t("capacity.detail", { busy: r.busy === null ? t("capacity.unknown") : `${r.busy} Mbps`, speed: r.speed === null ? t("capacity.unknown") : `${r.speed} Mbps`, full: pct(FULL_SHARE) })} />
          </Panel>
        </div>
      </Section>

      <Section id="t2-collections" title={t("sections.collections")}>
        <Panel
          demo={tag}
          title={t("calendar.title")}
          takeaway={win ? t(win.from === win.to ? "calendar.takeawayDay" : "calendar.takeaway", { share: pct(win.share), from: win.from, to: win.to, n: cal.total }) : t("calendar.takeawayNone")}
          empty={cal.total ? null : t("empty.payments")}
          tableLabel={tl}
          table={{ head: [t("cols.day"), t("cols.payments")], rows: cal.byDayOfMonth.map((n, i) => [i + 1, n]) }}
        >
          <PayCalendar days={cal.days} label={t("calendar.title")} dayLetters={t.raw("calendar.letters") as string[]} paymentsLabel={(n) => t("calendar.payments", { n })} />
          <p className="mt-2 text-xs text-zinc-400">{t("calendar.byDay")}</p>
          <PayDays counts={cal.byDayOfMonth} window={win} label={t("calendar.byDay")} dayLabel={(dd, n) => t("calendar.day", { d: dd, n })} />
        </Panel>
      </Section>
    </div>
  )
}

/** A chart's key: what each color is, drawn as the mark it is (line, area, band or bar). */
function Legend({ items }: { items: [string, string, "line" | "area" | "band" | "bar"][] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
      {items.map(([label, color, mark]) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={mark === "line" ? "h-0.5 w-3.5 rounded-full" : mark === "bar" ? "size-2.5 rounded-sm" : "h-2.5 w-3.5 rounded-sm"} style={{ background: color, opacity: mark === "band" ? 0.4 : mark === "area" ? 0.7 : 1 }} />
          {label}
        </li>
      ))}
    </ul>
  )
}
