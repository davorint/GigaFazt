"use client"

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { localToday } from "@/lib/clients/from-lead"
import { demoSet } from "@/lib/interno/dashboard-demo"
import type { NetworkFigures } from "@/lib/interno/dashboard-server"
import { lastMonths, monthNumbers, siteNumbers } from "@/lib/interno/numbers"
import { compareRows, faultMatrix, faultsPer10, MEASURES, payPrints, revenueTree, type Leaf, type Measure } from "@/lib/interno/tablero2-x"
import { linkSpeed } from "@/lib/wispdavor/capacity"
import { siteLabel } from "@/lib/sites/model"
import { forecast } from "@/lib/interno/outlook"
import { cohorts, moneyFlow, mrrAt, mrrBridge, networkGroups, payCalendar, payWindow, retentionAt, TONES, type FlowKind, type RingGroup, type Tone } from "@/lib/interno/tablero2"
import { FLOW_STATES, lightRows, recovered, REPAIR_GROUPS, repairLanes, revenueStreams, skyline, statusFlows, tenure, type RepairBar, type Star } from "@/lib/interno/tablero2-more"
import { demoCarriers } from "@/lib/interno/tablero2-demo"
import { carrierOf, continuityStrip, gatewayStats, hourglass, saturation, type CarrierFigures, type Cell, type GatewayHour } from "@/lib/interno/tablero2-net"
import { mxn } from "@/lib/materials/catalog"
import { reportsStore } from "@/lib/reports/store"
import { addMonths } from "@/lib/payments/model"
import { FULL_SHARE } from "@/lib/wispdavor/capacity"
import { useWispData } from "@/components/wispdavor/useWispData"
import { Panel } from "@/components/dashboard/Panel"
import { INK, SERIES } from "@/components/dashboard/theme"
import { CapacityBars } from "./CapacityBars"
import { FaultChord } from "./FaultChord"
import { BAND_COLOR, HorizonChart } from "./HorizonChart"
import { ParallelCoords } from "./ParallelCoords"
import { PayContours } from "./PayContours"
import { RevenuePack } from "./RevenuePack"
import { CarrierPulse } from "./CarrierPulse"
import { CELL_COLOR, ContinuityStrips } from "./ContinuityStrips"
import { PacketPath } from "./PacketPath"
import { SaturationForecast } from "./SaturationForecast"
import { SpeedHourglass } from "./SpeedHourglass"
import { CohortGrid } from "./CohortGrid"
import { k, monthName, pct, pesos, short, signed } from "./format"
import { MoneySankey } from "./MoneySankey"
import { MovesChart } from "./MovesChart"
import { MrrWaterfall } from "./MrrWaterfall"
import { NetworkRings, TONE_COLOR } from "./NetworkRings"
import { PayCalendar, PayDays } from "./PayCalendar"
import { RadialClock } from "./RadialClock"
import { RevenueChart } from "./RevenueChart"
import { LIGHT_COLOR, LightSwarm } from "./LightSwarm"
import { REPAIR_COLOR, RepairGantt } from "./RepairGantt"
import { Skyline } from "./Skyline"
import { Spark } from "./Spark"
import { FLOW_COLOR, StatusAlluvial } from "./StatusAlluvial"
import { Streamgraph } from "./Streamgraph"
import { TenureGalaxy } from "./TenureGalaxy"

const PERIODS = [6, 12, 24] as const
/** A contention ratio: "41:1", "1,5:1", "0,2:1" (never rounded down to 0). */
const ratioNum = (r: number) => (r >= 10 ? String(Math.round(r)) : r.toLocaleString("es-MX", { maximumFractionDigits: 1 }))
const ratioText = (r: number) => `${ratioNum(r)}:1`
/** The hour now in Mexico City (the traffic heat is in that zone). */
const hourInMexico = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "numeric", hourCycle: "h23" }).format(new Date()))

/**
 * A KPI tile. `meter` replaces the trend when there is no history to draw (the profit: costs aren't dated): a bar of
 * the share kept, the same height as a sparkline so the tiles line up.
 */
function Kpi({ label, value, hint, trend, color, demo, meter }: { label: string; value: string; hint: string; trend: (number | null)[]; color: string; demo: string; meter?: { share: number; label: string } }) {
  return (
    <div className="grid content-between gap-1 rounded-2xl border border-white/10 bg-[#0e0e10] p-4">
      <p className="flex items-center justify-between gap-2 text-xs text-zinc-400">
        {label}
        {demo && <span className="rounded border border-amber-300/50 px-1 font-mono text-[0.6rem] tracking-wide text-amber-200">{demo}</span>}
      </p>
      <p className="text-3xl font-light tracking-tight text-zinc-50 tabular-nums">{value}</p>
      <p className="text-xs text-zinc-400">{hint}</p>
      {meter ? (
        <div className="grid h-[46px] content-end gap-1.5">
          <div role="img" aria-label={meter.label} className="relative h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="t2-grow absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(0, Math.min(1, meter.share)) * 100}%`, background: color }} />
          </div>
          <p aria-hidden className="text-[0.7rem] text-zinc-500">{meter.label}</p>
        </div>
      ) : (
        <Spark values={trend} color={color} label={`${label}: ${value}. ${hint}`} />
      )}
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
  const [carrierNet, setCarrierNet] = useState<CarrierFigures | null | "error">(null)
  const [demo, setDemo] = useState(false)
  const [nowHour, setNowHour] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const today = d.loaded ? localToday() : ""
  const sim = useMemo(() => (demo && today ? demoSet(today) : null), [demo, today])
  const src = useMemo(() => sim ?? { clients: d.clients, payments: d.payments, sites: d.sites, reports: reports.list }, [sim, d.clients, d.payments, d.sites, reports.list])

  useEffect(() => {
    let live = true
    fetch("/api/interno/tablero", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { network?: NetworkFigures }
        if (live) setNet(r.ok && b.network ? b.network : "error")
      })
      .catch(() => live && setNet("error"))
    // Carriers, continuity, packet path and daily busy hours (third round).
    fetch("/api/interno/tablero2", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { carriers?: CarrierFigures }
        if (live) setCarrierNet(r.ok && b.carriers ? b.carriers : "error")
      })
      .catch(() => live && setCarrierNet("error"))
    const tick = () => {
      setNowHour(hourInMexico())
      setNowMs(Date.now())
    }
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
  // "Now" is today everywhere: a scheduled install (a service starting later) isn't a client, income or MRR yet.
  const flow = useMemo(() => moneyFlow(src.sites, src.clients, today), [src, today])
  const bridge = useMemo(() => (months.length ? mrrBridge(src.clients, addMonths(months[0], -1), cur, today) : null), [src, months, cur, today])
  const mrrYear = useMemo(() => year.map((m) => Math.round(src.clients.reduce((a, c) => a + mrrAt(c, m, m === cur ? today : undefined), 0))), [src, year, cur, today])
  const cohortRows = useMemo(() => cohorts(src.clients, months, today), [src, months, today])
  // Kept at 3 months over the trailing window that ends each month of the year (the KPI's trend).
  const r3Trend = useMemo(() => year.map((m) => { const v = retentionAt(cohorts(src.clients, lastMonths(m, Math.min(period, 12)), m === cur ? today : undefined), 3); return v === null ? null : Math.round(v * 1000) / 10 }), [src, year, period, cur, today])
  const groups = useMemo(() => (today ? networkGroups(src.sites, src.clients, src.payments, today) : []), [src, today])
  const cal = useMemo(() => (today ? payCalendar(src.payments, today, 26) : null), [src, today])
  const nodeName = useCallback((kind: FlowKind, label: string) => (kind === "plan" || kind === "site" ? label : t(`flow.nodes.${kind}`)), [t])
  const groupName = useCallback((g: RingGroup) => g.name || t("rings.noSite"), [t])
  const toneLabel = useCallback((x: Tone) => t(`rings.tones.${x}`), [t])
  // Second round (owner, 2026-11-22: "more, way more impressive").
  const streams = useMemo(() => revenueStreams(src.clients, months), [src, months])
  const flowMonths = useMemo(() => (cur ? lastMonths(cur, Math.min(period, 6)) : []), [cur, period])
  const flows = useMemo(() => (today ? statusFlows(src.clients, src.payments, flowMonths, today) : null), [src, flowMonths, today])
  const sky = useMemo(() => skyline(src.sites, src.clients, today), [src, today])
  const light = useMemo(() => lightRows(src.sites, src.clients), [src])
  const stars = useMemo(() => (today ? tenure(src.clients, src.sites, today) : []), [src, today])
  const repairs = useMemo(() => (nowMs ? repairLanes(src.reports, src.sites, nowMs, 90) : null), [src, nowMs])
  // Third round (owner, 2026-11-22: carriers, speed of service, continuity, and a suggestion).
  const carriers = useMemo(() => (sim ? (nowMs ? demoCarriers(sim, nowMs) : null) : carrierNet && carrierNet !== "error" ? carrierNet : null), [sim, nowMs, carrierNet])
  const strips = useMemo(() => (carriers && nowMs ? carriers.continuity.map((c) => ({ c, strip: continuityStrip(c, nowMs) })) : []), [carriers, nowMs])
  const forecasts = useMemo(() => (carriers && today ? saturation(src.sites, carriers.daily, today) : []), [carriers, src, today])
  // Fourth round (owner, 2026-11-23: "5 more custom made, cutting edge").
  const tree = useMemo(() => (today ? revenueTree(src.sites, src.clients, src.payments, today) : null), [src, today])
  const chordM = useMemo(() => (nowMs ? faultMatrix(src.reports, src.sites, nowMs, 90) : null), [src, nowMs])
  const prints = useMemo(() => (today ? payPrints(src.payments, src.clients, today, 12, 10) : null), [src, today])
  const siteRows = useMemo(() => siteNumbers(src.sites, src.clients), [src])
  const streamName = useCallback((key: string) => (key === "__tv" ? t("streams.tv") : key === "__otros" ? t("streams.otros") : key), [t])
  const streamColor = useCallback((key: string) => SERIES[streams.keys.indexOf(key)] ?? INK.muted, [streams.keys])

  if (!d.loaded || !reports.loaded || !fc || !bridge || !cal || !flows || !repairs || !rows.length) return <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>

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
  // Carriers and continuity
  const siteName = (id: string) => {
    const s = src.sites.find((x) => x.id === id)
    return s ? siteLabel(s) : t("rings.noSite")
  }
  const ms = (v: number) => `${v < 10 ? v.toLocaleString("es-MX", { maximumFractionDigits: 1 }) : Math.round(v)} ms`
  const speedText = (mbps: number) => (mbps >= 1000 ? `${(mbps / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })} Gbps` : `${Math.round(mbps)} Mbps`)
  const pulseRows = (carriers?.gateways ?? []).map((g) => {
    const st = gatewayStats(g.hours)
    const name = carrierOf(src.sites, g.siteId, g.ip) || g.ip
    return { key: `${g.routerId}|${g.ip}`, title: name, sub: siteName(g.siteId), hours: g.hours, rtt: st.rtt, loss: st.loss, stats: t("pulse.stats", { rtt: st.rtt === null ? "—" : ms(st.rtt), p95: st.p95 === null ? "—" : ms(st.p95), loss: pct(st.loss, 2) }) }
  })
  const byRtt = pulseRows.filter((r) => r.rtt !== null).sort((a, b) => (a.rtt as number) - (b.rtt as number))
  const lossAll = pulseRows.length ? pulseRows.reduce((a, r) => a + (r.loss ?? 0), 0) / pulseRows.length : null
  const pulseTip = (h: GatewayHour) => ({ title: new Date(h.t).toLocaleString("es-MX", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), rows: [{ label: t("pulse.median"), value: h.rtt === null ? t("pulse.noReply") : ms(h.rtt) }, { label: t("pulse.p95"), value: h.p95 === null ? "—" : ms(h.p95) }, { label: t("pulse.lost"), value: pct(h.loss, 1) }] })
  const availText = (a: number | null) => (a === null ? "—" : `${(a * 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`)
  const minutesText = (m: number) => (m >= 120 ? `${(m / 60).toLocaleString("es-MX", { maximumFractionDigits: 1 })} h` : `${m} min`)
  const stripRows = strips.map(({ c, strip }) => ({ key: c.routerId, title: c.router, sub: siteName(c.siteId), strip, headline: availText(strip.availability), detail: t("continuity.detail", { outages: strip.outages, minutes: minutesText(strip.downMinutes) }) }))
  const worstStrip = [...stripRows].filter((r) => r.strip.availability !== null).sort((a, b) => (a.strip.availability as number) - (b.strip.availability as number))[0]
  const watchedAll = strips.reduce((a, x) => a + x.strip.cells.filter((cc) => cc !== 0).length, 0)
  const availAll = watchedAll ? 1 - strips.reduce((a, x) => a + x.strip.downMinutes, 0) / 60 / watchedAll : null
  const busyByName = new Map((network?.sites ?? []).map((x) => [x.name, x.busyDown]))
  const glasses = hourglass(src.sites, src.clients, busyByName, today)

  // Fourth round: money map, traffic horizon, fault chord, payment fingerprint, deployments compared.
  const packSites = (tree?.children ?? []).map((n) => ({ name: "name" in n ? n.name : "", value: 0, n }))
  const leafSum = (n: unknown): number => (n && typeof n === "object" && "children" in n ? (n as { children: unknown[] }).children.reduce((a: number, c) => a + leafSum(c), 0) : ((n as Leaf).value ?? 0))
  for (const x of packSites) x.value = leafSum(x.n)
  const packTotal = packSites.reduce((a, x) => a + x.value, 0)
  const packTop = [...packSites].sort((a, b) => b.value - a.value)[0]
  const packTip = (l: Leaf) => ({ title: l.place || t("pack.noPlace"), rows: [{ label: t("pack.plan"), value: l.plan || "—" }, { label: t("pack.pays"), value: mxn(l.value) }, { label: t("pack.status"), value: t(`rings.tones.${l.tone}`) }] })
  const horizonRows = (carriers?.traffic ?? []).map((tr) => {
    const site = src.sites.find((x) => x.id === tr.siteId)
    const link = site ? linkSpeed(site).down : null
    const hours = tr.hours.map((h) => ({ t: Date.parse(h.t) + 1800000, down: h.down }))
    const peak = Math.max(0, ...hours.map((h) => h.down))
    return { key: tr.siteId, name: siteName(tr.siteId), link, hours, peakMbps: peak, over: link ? hours.filter((h) => h.down >= 0.8 * link).length : 0, peak: link ? t("horizon.peak", { pct: pct(peak / link) }) : t("horizon.peakNoLink", { mbps: speedText(peak) }) }
  })
  const hotHorizon = [...horizonRows].filter((r) => r.link).sort((a, b) => b.over - a.over || b.peakMbps / (b.link as number) - a.peakMbps / (a.link as number))[0]
  const chordSites = chordM ? chordM.sites.map((x, i) => ({ ...x, n: chordM.counts[i].reduce((a, b) => a + b, 0), top: chordM.kinds[chordM.counts[i].indexOf(Math.max(...chordM.counts[i]))] })) : []
  const faultsBySite = new Map(chordSites.map((x) => [x.id, x.n]))
  const routerAvail = new Map<string, number>()
  for (const x of strips) if (x.strip.availability !== null) routerAvail.set(x.c.siteId, Math.min(routerAvail.get(x.c.siteId) ?? 1, x.strip.availability))
  const latency = new Map((carriers?.path ?? []).filter((x) => x.gatewayRtt !== null).map((x) => [x.siteId, (x.gatewayRtt ?? 0) + (x.ontRtt ?? 0)]))
  const useByName = new Map((network?.sites ?? []).map((x) => [x.name, x.use]))
  const compare = compareRows(
    siteRows.filter((x) => x.clients > 0).sort((a, b) => b.active - a.active),
    (id) => {
      const x = siteRows.find((r) => r.id === id)
      return x ? { clients: x.active, penetration: x.penetration, income: x.income, profit: x.profit, use: useByName.get(x.name) ?? null, latency: latency.get(id) ?? null, availability: routerAvail.get(id) ?? null, faults: chordM ? faultsPer10(faultsBySite.get(id) ?? 0, x.active) : null } : {}
    }
  )
  const fmtMeasure = (m: Measure, v: number) => (m === "clients" ? String(Math.round(v)) : m === "penetration" || m === "use" || m === "availability" ? pct(v, m === "availability" ? 2 : 0) : m === "income" || m === "profit" ? k(v) : m === "latency" ? ms(v) : v.toLocaleString("es-MX", { maximumFractionDigits: 1 }))
  // Who is on top (best value) of the most axes, and who at the bottom.
  const wins = new Map<string, number>()
  const losses = new Map<string, number>()
  const axesWithData = MEASURES.filter((m) => compare.filter((r) => r.values[m] !== null).length >= 2)
  for (const m of axesWithData) {
    const vals = compare.filter((r) => r.values[m] !== null)
    const sorted = [...vals].sort((a, b) => ((b.values[m] as number) - (a.values[m] as number)) * (["use", "latency", "faults"].includes(m) ? -1 : 1))
    wins.set(sorted[0].id, (wins.get(sorted[0].id) ?? 0) + 1)
    losses.set(sorted[sorted.length - 1].id, (losses.get(sorted[sorted.length - 1].id) ?? 0) + 1)
  }
  const bestId = [...wins].sort((a, b) => b[1] - a[1])[0]
  const worstId = [...losses].sort((a, b) => b[1] - a[1])[0]
  const topGlass = glasses.find((g) => g.ratio !== null)
  const glassLines = (g: (typeof glasses)[number]) => {
    const use = g.busy !== null && g.link ? g.busy / g.link : null
    return [
      { label: t("hourglass.sold", { n: g.active }), value: speedText(g.sold) + (g.unknown ? ` · ${t("hourglass.unknown", { n: g.unknown })}` : "") },
      { label: t("hourglass.link"), value: g.link ? `${speedText(g.link)} · ${g.ratio === null ? "—" : ratioText(g.ratio)}` : t("hourglass.noLink") },
      ...(use === null ? [] : [{ label: t("hourglass.busy"), value: `${speedText(g.busy as number)} · ${pct(use)}`, tone: use >= 0.8 ? ("bad" as const) : use >= 0.6 ? ("warn" as const) : undefined }]),
      ...(g.each === null ? [] : [{ label: t("hourglass.each"), value: `${speedText(g.each)} c/u` }]),
    ]
  }
  const pathRows = (carriers?.path ?? []).map((pp) => {
    const site = src.sites.find((x) => x.id === pp.siteId)
    const names = site ? site.rooms.flatMap((r) => r.carriers.map((c) => c.name.trim()).filter(Boolean)) : []
    return { key: pp.routerId, name: siteName(pp.siteId), carrier: names.join(" + ") || t("cols.carrier"), ont: pp.ontRtt, ontP90: pp.ontP90, gateway: pp.gatewayRtt, lossNote: pp.onts ? (pp.ontLossy ? t("path.loss", { lossy: pp.ontLossy, n: pp.onts }) : t("path.lossNone", { n: pp.onts })) : "" }
  })
  const measured = pathRows.filter((r) => r.gateway !== null)
  const slowest = [...measured].sort((a, b) => (b.gateway ?? 0) + (b.ont ?? 0) - ((a.gateway ?? 0) + (a.ont ?? 0)))[0]
  const avgPath = measured.length ? measured.reduce((a, r) => a + (r.gateway ?? 0) + (r.ont ?? 0), 0) / measured.length : null
  const firstFull = forecasts.find((f) => f.full)
  const firstSoon = forecasts.find((f) => !f.full && f.eta !== null)
  const etaDate = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) + days * 864e5).toLocaleDateString("es-MX", { day: "numeric", month: "long" })
  const cellLabel = (c: Cell) => t(`continuity.cells.${c}`)
  const capRows = network ? network.sites.filter((s) => s.use !== null).map((s) => ({ name: s.name, use: s.use ?? 0, busy: s.busyDown, speed: s.speedDown })).sort((a, b) => b.use - a.use) : []

  // Collections
  const win = payWindow(cal.byDayOfMonth)

  // Second round
  const lastStream = streams.rows[streams.rows.length - 1]
  const firstStream = streams.rows[0]
  const streamTotal = (r: typeof lastStream) => streams.keys.reduce((a, key) => a + (r?.values[key] ?? 0), 0)
  const topKey = [...streams.keys].sort((a, b) => (lastStream?.values[b] ?? 0) - (lastStream?.values[a] ?? 0))[0]
  const rec = recovered(flows)
  const skyApts = sky.reduce((a, x) => a + x.apartments, 0)
  const skyActive = sky.reduce((a, x) => a + Math.min(x.active, x.apartments), 0)
  const ontCount = light.reduce((a, r) => a + r.dots.length, 0)
  const weak = light.reduce((a, r) => a + r.dots.filter((x) => x.status === "baja" || x.status === "justo").length, 0)
  const falling = light.reduce((a, r) => a + r.dots.filter((x) => (x.drop ?? 0) >= 3).length, 0)
  const liveStars = stars.filter((x) => x.live)
  const avgTenure = liveStars.length ? Math.round(liveStars.reduce((a, x) => a + x.months, 0) / liveStars.length) : 0
  const dayLong = (dd: string) => new Date(`${dd}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
  const starKey = (x: Star) => (x.plan && streams.keys.includes(x.plan) ? x.plan : !x.plan && streams.keys.includes("__tv") ? "__tv" : "__otros")
  const dur = (h: number) => (h < 48 ? t("repairs.hours", { n: Math.max(1, Math.round(h)) }) : t("repairs.days", { n: Math.round(h / 24) }))
  const openRepairs = repairs.bars.filter((b) => b.open).length
  const repairTip = (b: RepairBar) => ({ title: t(`repairs.groups.${b.group}`), rows: [...(b.site ? [{ label: t("repairs.site"), value: b.site }] : []), { label: t("repairs.opened"), value: new Date(b.start).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) }, { label: b.open ? t("repairs.openFor") : t("repairs.took"), value: dur(b.hours) }] })

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
          <Kpi demo={tag} label={t("kpi.profit")} value={pesos(flow.profit)} hint={t("kpi.profitHint", { income: k(flow.income), costs: k(flow.costs) })} trend={[]} color={SERIES[2]} meter={{ share: flow.income ? flow.profit / flow.income : 0, label: t("kpi.profitMeter", { margin: pct(flow.income ? flow.profit / flow.income : null) }) }} />
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
        <Panel
          demo={tag}
          title={t("streams.title")}
          takeaway={topKey && lastStream && streamTotal(lastStream) ? t("streams.takeaway", { top: streamName(topKey), share: pct((lastStream.values[topKey] ?? 0) / streamTotal(lastStream)), month: monthName(lastStream.month), months: period, from: mxn(streamTotal(firstStream)), to: mxn(streamTotal(lastStream)) }) : undefined}
          empty={streams.keys.length ? null : t("empty.flow")}
          tableLabel={tl}
          table={{ head: [t("cols.month"), ...streams.keys.map(streamName), t("streams.total")], rows: streams.rows.map((r) => [short(r.month), ...streams.keys.map((key) => mxn(r.values[key] ?? 0)), mxn(streamTotal(r))]) }}
        >
          <Streamgraph streams={streams} label={t("streams.title")} name={streamName} color={streamColor} totalLabel={t("streams.total")} />
          <Legend items={streams.keys.map((key) => [streamName(key), streamColor(key), "bar"] as [string, string, "bar"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("streams.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("pack.title")}
          takeaway={packTop && packTotal ? t("pack.takeaway", { top: packTop.name || t("pack.noSite"), share: pct(packTop.value / packTotal), amount: mxn(packTop.value) }) : undefined}
          empty={tree && tree.children.length ? null : t("pack.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("cols.amount"), "%"], rows: [...packSites].sort((a, b) => b.value - a.value).map((x) => [x.name || t("pack.noSite"), mxn(x.value), pct(packTotal ? x.value / packTotal : null)]) }}
        >
          {tree && <RevenuePack tree={tree} label={t("pack.title")} siteName={(n) => n || t("pack.noSite")} towerName={(n) => n || t("pack.noTower")} leafTip={packTip} allLabel={t("pack.all")} clientsLabel={(n) => t("pack.clients", { n })} towersLabel={(n) => t("pack.towers", { n })} />}
          <Legend items={TONES.map((x) => [t(`rings.tones.${x}`), TONE_COLOR[x], "dot"] as [string, string, "dot"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("pack.note")}</p>
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
        <div className="grid items-start gap-3 lg:grid-cols-2">
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
        <Panel
          demo={tag}
          title={t("flows.title")}
          takeaway={flowMonths.length > 1 ? (rec.share === null ? t("flows.takeawayNone", { prev: monthName(flowMonths[flowMonths.length - 2]) }) : t("flows.takeaway", { late: rec.late, prev: monthName(flowMonths[flowMonths.length - 2]), share: pct(rec.share), cur: monthName(flowMonths[flowMonths.length - 1]) })) : undefined}
          empty={flows.counts.some((c) => FLOW_STATES.some((x) => c[x])) ? null : t("empty.clients")}
          tableLabel={tl}
          table={{ head: [t("cols.state"), ...flowMonths.map(short)], rows: FLOW_STATES.map((x) => [t(`flows.states.${x}`), ...flows.counts.map((c) => c[x])]) }}
        >
          <StatusAlluvial flows={flows} label={t("flows.title")} stateLabel={(x) => t(`flows.states.${x}`)} clientsLabel={(n) => t("flows.clients", { n })} />
          <Legend items={FLOW_STATES.map((x) => [t(`flows.states.${x}`), FLOW_COLOR[x], "bar"] as [string, string, "bar"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("flows.note")}</p>
        </Panel>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Panel
            demo={tag}
            title={t("galaxy.title")}
            takeaway={liveStars.length ? t("galaxy.takeaway", { live: liveStars.length, avg: avgTenure, first: dayLong(stars[0].start) }) : undefined}
            empty={stars.length ? null : t("galaxy.empty")}
            tableLabel={tl}
            table={{ head: [t("cols.start"), t("cols.site"), t("galaxy.plan"), t("galaxy.months"), t("galaxy.pays")], rows: [...stars].reverse().map((x) => [x.start, x.site || "—", x.live ? x.plan || "—" : t("galaxy.gone"), x.months, mxn(x.monthly)]) }}
          >
            <TenureGalaxy
              stars={stars}
              today={today}
              label={t("galaxy.title")}
              color={(x) => streamColor(starKey(x))}
              center={String(liveStars.length)}
              centerHint={t("galaxy.center")}
              tipRows={(x) => ({ title: x.site || t("rings.noSite"), rows: [{ label: t("galaxy.plan"), value: x.plan || "—" }, { label: t("galaxy.since"), value: dayLong(x.start) }, { label: t("galaxy.months"), value: String(x.months) }, { label: x.live ? t("galaxy.pays") : t("galaxy.paid"), value: mxn(x.monthly) }, ...(x.live ? [] : [{ label: t("galaxy.gone"), value: "" }])] })}
            />
            <Legend items={[...streams.keys.map((key) => [streamName(key), streamColor(key), "dot"] as [string, string, "dot"]), [t("galaxy.gone"), INK.muted, "ring"] as [string, string, "ring"]]} />
            <p className="text-[0.7rem] text-zinc-500">{t("galaxy.note")}</p>
          </Panel>
          <Panel
            demo={tag}
            title={t("skyline.title")}
            takeaway={sky.length ? t("skyline.takeaway", { name: sky[0].name, pct: pct(Math.min(1, sky[0].active / sky[0].apartments)), active: skyActive, apartments: skyApts, all: pct(skyApts ? skyActive / skyApts : null) }) : undefined}
            empty={sky.length ? null : t("skyline.empty")}
            tableLabel={tl}
            table={{ head: [t("cols.site"), t("cols.tower"), t("cols.apartments"), t("cols.clients")], rows: sky.flatMap((x) => x.towers.map((tw) => [x.name, tw.name, tw.apartments, tw.lit])) }}
          >
            <Skyline sites={sky} towerLabel={(tw) => t("skyline.tower", { name: tw.name, lit: tw.lit, apartments: tw.apartments })} siteLine={(x) => t("skyline.site", { active: x.active, apartments: x.apartments, pct: pct(Math.min(1, x.active / x.apartments)) })} looseLabel={(n) => t("skyline.loose", { n })} />
            <p className="text-[0.7rem] text-zinc-500">{t("skyline.note")}</p>
          </Panel>
        </div>
      </Section>

      <Section id="t2-network" title={t("sections.network")}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            demo={tag}
            title={t("clock.title")}
            takeaway={network?.hasTraffic && pk ? t("clock.takeaway", { day: days[pk.d], h: pk.h, v: Math.round(pk.v).toLocaleString("es-MX") }) : undefined}
            empty={!network ? (net === "error" ? t("offline") : t("loading")) : network.hasTraffic ? null : t("empty.traffic")}
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
            empty={!network ? (net === "error" ? t("offline") : t("loading")) : capRows.length ? null : t("empty.capacity")}
            tableLabel={tl}
            table={{ head: [t("cols.site"), t("cols.use"), "Mbps"], rows: capRows.map((r) => [r.name, pct(r.use), r.busy === null || r.speed === null ? "—" : `${r.busy} / ${r.speed}`]) }}
          >
            <CapacityBars rows={capRows} full={FULL_SHARE} fullLabel={t("capacity.full")} detail={(r) => t("capacity.detail", { busy: r.busy === null ? t("capacity.unknown") : `${r.busy} Mbps`, speed: r.speed === null ? t("capacity.unknown") : `${r.speed} Mbps`, full: pct(FULL_SHARE) })} />
          </Panel>
        </div>
        <Panel
          demo={tag}
          title={t("light.title")}
          takeaway={ontCount ? t("light.takeaway", { n: ontCount, weak, falling }) : undefined}
          empty={ontCount ? null : t("light.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("cols.zone"), "ONT"], rows: light.flatMap((r) => (["baja", "justo", "bien", "satura"] as const).map((z) => [r.name || t("light.noSite"), t(`light.zones.${z}`), r.dots.filter((x) => x.status === z).length])) }}
        >
          <LightSwarm rows={light} label={t("light.title")} name={(r) => r.name || t("light.noSite")} zoneLabel={(z) => t(`light.zones.${z}`)} unknownPlace={t("light.noPlace")} dotTitle={(x) => ({ rx: t("light.rx", { v: x.rx.toLocaleString("es-MX") }), drop: x.drop !== null && x.drop >= 1 && x.first !== null ? t("light.drop", { d: x.drop.toLocaleString("es-MX"), first: x.first.toLocaleString("es-MX") }) : null })} />
          <Legend items={(["bien", "justo", "baja", "satura"] as const).map((z) => [t(`light.zones.${z}`), LIGHT_COLOR[z], "dot"] as [string, string, "dot"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("light.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("horizon.title")}
          takeaway={hotHorizon ? (hotHorizon.over ? t("horizon.takeaway", { name: hotHorizon.name, hours: hotHorizon.over, peak: speedText(hotHorizon.peakMbps), pct: pct(hotHorizon.peakMbps / (hotHorizon.link as number)) }) : t("horizon.takeawayCalm", { name: hotHorizon.name, pct: pct(hotHorizon.peakMbps / (hotHorizon.link as number)) })) : undefined}
          empty={!carriers ? (carrierNet === "error" ? t("offline") : t("loading")) : horizonRows.length ? null : t("horizon.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("hourglass.busy"), t("horizon.ofLink"), "≥ 80 %"], rows: horizonRows.map((r) => [r.name, speedText(r.peakMbps), r.link ? pct(r.peakMbps / r.link) : "—", r.link ? `${r.over} h` : "—"]) }}
        >
          <HorizonChart rows={horizonRows} from={nowMs - 7 * 864e5} now={nowMs} label={t("horizon.title")} tipFor={(r, h) => ({ title: `${r.name} · ${new Date(h.t - 1800000).toLocaleString("es-MX", { weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`, rows: [{ label: t("horizon.down"), value: speedText(h.down) }, ...(r.link ? [{ label: t("horizon.ofLink"), value: pct(h.down / r.link) }] : [])] })} />
          <Legend items={(t.raw("horizon.bands") as string[]).map((b, i) => [b, BAND_COLOR[i], "bar"] as [string, string, "bar"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("horizon.note")}</p>
        </Panel>
      </Section>

      <Section id="t2-carriers" title={t("sections.carriers")}>
        <Panel
          demo={tag}
          title={t("pulse.title")}
          takeaway={pulseRows.length ? (byRtt.length === 1 ? t("pulse.takeawayOne", { rtt: ms(byRtt[0].rtt as number), name: `${byRtt[0].title} · ${byRtt[0].sub}`, loss: pct(lossAll, 2) }) : byRtt.length ? t("pulse.takeaway", { best: ms(byRtt[0].rtt as number), bestName: `${byRtt[0].title} · ${byRtt[0].sub}`, worst: ms(byRtt[byRtt.length - 1].rtt as number), worstName: `${byRtt[byRtt.length - 1].title} · ${byRtt[byRtt.length - 1].sub}`, loss: pct(lossAll, 2) }) : t("pulse.takeawayNoRtt", { loss: pct(lossAll, 2) })) : undefined}
          empty={!carriers ? (carrierNet === "error" ? t("offline") : t("loading")) : pulseRows.length ? null : t("pulse.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.carrier"), t("cols.site"), t("pulse.median"), t("pulse.lost")], rows: pulseRows.map((r) => [r.title, r.sub, r.rtt === null ? "—" : ms(r.rtt), pct(r.loss, 2)]) }}
        >
          {carriers && <CarrierPulse rows={pulseRows} from={nowMs - 7 * 864e5} now={nowMs} label={t("pulse.title")} tip={pulseTip} noLatency={t("pulse.noLatency")} />}
          <p className="text-[0.7rem] text-zinc-500">{t("pulse.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("continuity.title")}
          takeaway={worstStrip ? t("continuity.takeaway", { worst: worstStrip.title.includes(worstStrip.sub) ? worstStrip.title : `${worstStrip.title} (${worstStrip.sub})`, worstA: worstStrip.headline, outages: worstStrip.strip.outages, minutes: minutesText(worstStrip.strip.downMinutes), all: availText(availAll) }) : undefined}
          empty={!carriers ? (carrierNet === "error" ? t("offline") : t("loading")) : stripRows.length ? null : t("continuity.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.router"), t("cols.site"), t("cols.availability"), t("continuity.cells.3")], rows: stripRows.map((r) => [r.title, r.sub, r.headline, r.detail]) }}
        >
          <ContinuityStrips rows={stripRows} label={t("continuity.title")} cellLabel={cellLabel} hourLabel={(tt) => new Date(tt).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />
          <Legend items={([1, 2, 3, 0] as const).map((c) => [cellLabel(c), CELL_COLOR[c], "bar"] as [string, string, "bar"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("continuity.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("hourglass.title")}
          takeaway={topGlass ? t((topGlass.ratio as number) >= 1 ? "hourglass.takeaway" : "hourglass.takeawayUnder", { name: topGlass.name, ratio: ratioNum(topGlass.ratio as number), share: pct(topGlass.ratio), each: topGlass.each === null ? "—" : speedText(topGlass.each), use: topGlass.busy !== null && topGlass.link ? pct(topGlass.busy / topGlass.link) : "—" }) : undefined}
          empty={glasses.length ? null : t("hourglass.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("cols.sold"), t("cols.link"), t("cols.ratio"), t("hourglass.busy"), t("hourglass.each")], rows: glasses.map((g) => [g.name, speedText(g.sold), g.link ? speedText(g.link) : "—", g.ratio === null ? "—" : ratioText(g.ratio), g.busy === null ? "—" : speedText(g.busy), g.each === null ? "—" : speedText(g.each)]) }}
        >
          <SpeedHourglass glasses={glasses} lines={glassLines} />
          <p className="text-[0.7rem] text-zinc-500">{t("hourglass.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("path.title")}
          takeaway={avgPath !== null && slowest ? t("path.takeaway", { total: ms(avgPath), slow: slowest.name, ms: ms((slowest.gateway ?? 0) + (slowest.ont ?? 0)) }) : undefined}
          empty={!carriers ? (carrierNet === "error" ? t("offline") : t("loading")) : pathRows.length ? null : t("path.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("path.home"), "p90", t("cols.carrier"), t("cols.latency")], rows: pathRows.map((r) => [r.name, r.ont === null ? "—" : ms(r.ont), r.ontP90 === null ? "—" : ms(r.ontP90), r.carrier, r.gateway === null ? "—" : ms(r.gateway)]) }}
        >
          <PacketPath rows={pathRows} label={t("path.title")} names={{ home: t("path.home"), router: t("path.router"), internet: t("path.internet"), unmeasured: t("path.unmeasured") }} ms={ms} />
          <p className="text-[0.7rem] text-zinc-500">{t("path.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("forecast.title")}
          takeaway={forecasts.length ? (firstFull ? t("forecast.takeawayFull", { name: firstFull.name }) : firstSoon && firstSoon.eta !== null ? t("forecast.takeaway", { name: firstSoon.name, date: etaDate(firstSoon.eta), days: firstSoon.eta }) : t("forecast.takeawayCalm")) : undefined}
          empty={!carriers ? (carrierNet === "error" ? t("offline") : t("loading")) : forecasts.length ? null : t("forecast.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("forecast.today"), t("forecast.week"), t("cols.eta")], rows: forecasts.map((f) => [f.name, pct(f.level), `${f.slope >= 0 ? "+" : "−"}${pct(Math.abs(f.slope * 7), 1)}`, f.full ? t("forecast.already") : f.eta === null ? t("forecast.never") : etaDate(f.eta)]) }}
        >
          <SaturationForecast
            rows={forecasts}
            today={today}
            label={t("forecast.title")}
            name={(f) => f.name}
            fullLabel={t("forecast.full")}
            tipFor={(f) => ({ title: f.name, rows: [{ label: t("forecast.today"), value: pct(f.level) }, { label: t("forecast.week"), value: `${f.slope >= 0 ? "+" : "−"}${pct(Math.abs(f.slope * 7), 1)}` }, { label: t("forecast.eta"), value: f.full ? t("forecast.already") : f.eta === null ? t("forecast.never") : etaDate(f.eta) }] })}
          />
          <p className="text-[0.7rem] text-amber-200/80">{t("forecast.estimate")} · {t("forecast.note")}</p>
        </Panel>
      </Section>

      <Section id="t2-ops" title={t("sections.ops")}>
        <Panel
          demo={tag}
          title={t("repairs.title")}
          takeaway={repairs.bars.length ? (repairs.median === null ? t("repairs.takeawayNoMedian", { n: repairs.bars.length }) : t("repairs.takeaway", { n: repairs.bars.length, median: dur(repairs.median), open: openRepairs })) : undefined}
          empty={repairs.bars.length ? null : t("repairs.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.kind"), t("repairs.site"), t("repairs.opened"), t("repairs.took")], rows: [...repairs.bars].reverse().map((b) => [t(`repairs.groups.${b.group}`), b.site || "—", new Date(b.start).toLocaleDateString("es-MX"), b.open ? `${t("repairs.openFor")} ${dur(b.hours)}` : dur(b.hours)]) }}
        >
          <RepairGantt bars={repairs.bars} lanes={repairs.lanes} from={repairs.from} now={nowMs} label={t("repairs.title")} backlogLabel={(n) => t("repairs.backlog", { n })} tipFor={repairTip} />
          <Legend items={REPAIR_GROUPS.map((g) => [t(`repairs.groups.${g}`), REPAIR_COLOR[g], "bar"] as [string, string, "bar"])} />
          <p className="text-[0.7rem] text-zinc-500">{t("repairs.note")}</p>
        </Panel>
        <Panel
          demo={tag}
          title={t("chord.title")}
          takeaway={chordM && chordSites.length ? t("chord.takeaway", { site: chordSites[0].name || t("pack.noSite"), share: pct(chordSites[0].n / chordM.total), kind: t(`repairs.groups.${chordSites[0].top}`) }) : undefined}
          empty={chordM && chordM.total ? null : t("chord.empty")}
          tableLabel={tl}
          table={chordM ? { head: [t("cols.site"), ...chordM.kinds.map((x) => t(`repairs.groups.${x}`))], rows: chordM.sites.map((x, i) => [x.name || t("pack.noSite"), ...chordM.counts[i]]) } : undefined}
        >
          {chordM && <FaultChord m={chordM} label={t("chord.title")} siteName={(n) => n || t("pack.noSite")} kindLabel={(x) => t(`repairs.groups.${x}`)} reportsLabel={(n) => t("chord.reports", { n })} />}
          <p className="text-[0.7rem] text-zinc-500">{t("chord.note")}</p>
        </Panel>
      </Section>

      <Section id="t2-collections" title={t("sections.collections")}>
        <Panel
          demo={tag}
          title={t("calendar.title")}
          takeaway={win ? t(win.from === win.to ? "calendar.takeawayDay" : win.from > win.to ? "calendar.takeawayWrap" : "calendar.takeaway", { share: pct(win.share), from: win.from, to: win.to, n: cal.total }) : t("calendar.takeawayNone")}
          empty={cal.total ? null : t("empty.payments")}
          tableLabel={tl}
          table={{ head: [t("cols.day"), t("cols.payments")], rows: cal.byDayOfMonth.map((n, i) => [i + 1, n]) }}
        >
          <PayCalendar days={cal.days} label={t("calendar.title")} dayLetters={t.raw("calendar.letters") as string[]} paymentsLabel={(n) => t("calendar.payments", { n })} />
          <p className="mt-2 text-xs text-zinc-400">{t("calendar.byDay")}</p>
          <PayDays counts={cal.byDayOfMonth} window={win} label={t("calendar.byDay")} dayLabel={(dd, n) => t("calendar.day", { d: dd, n })} />
        </Panel>
        <Panel
          demo={tag}
          title={t("prints.title")}
          takeaway={prints && prints.points.length ? (prints.loyal !== null && prints.fresh !== null ? t("prints.takeaway", { loyal: pct(prints.loyal), fresh: pct(prints.fresh) }) : t("prints.takeawayAll", { all: pct(prints.points.filter((x) => x.day <= 10).length / prints.points.length) })) : undefined}
          empty={prints && prints.points.length ? null : t("prints.empty")}
          tableLabel={tl}
          table={prints ? { head: [t("cols.day"), t("cols.payments")], rows: Array.from({ length: 31 }, (_, i) => [i + 1, prints.points.filter((x) => x.day === i + 1).length]) } : undefined}
        >
          {prints && <PayContours points={prints.points} maxTenure={prints.maxTenure} due={10} label={t("prints.title")} dueLabel={t("prints.due")} xLabel={t("prints.x")} yLabel={t("prints.y")} cellTip={(day, months, n) => ({ title: t("prints.tip", { day, months }), rows: [{ label: t("prints.near"), value: String(n) }] })} />}
          <p className="text-[0.7rem] text-zinc-500">{t("prints.note")}</p>
        </Panel>
      </Section>

      <Section id="t2-compare" title={t("sections.compare")}>
        <Panel
          demo={tag}
          title={t("compare.title")}
          takeaway={bestId && worstId && compare.length >= 2 ? t("compare.takeaway", { best: compare.find((r) => r.id === bestId[0])?.name ?? "", n: bestId[1], of: axesWithData.length, worst: compare.find((r) => r.id === worstId[0])?.name ?? "", m: worstId[1] }) : undefined}
          empty={compare.length >= 2 ? null : t("compare.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), ...MEASURES.map((m) => t(`compare.axes.${m}`))], rows: compare.map((r) => [r.name, ...MEASURES.map((m) => (r.values[m] === null ? "—" : fmtMeasure(m, r.values[m] as number)))]) }}
        >
          <ParallelCoords rows={compare} label={t("compare.title")} axisLabel={(m) => t(`compare.axes.${m}`)} fmt={fmtMeasure} better={{ high: t("compare.better.high"), low: t("compare.better.low") }} />
          <p className="text-[0.7rem] text-zinc-500">{t("compare.note")}</p>
        </Panel>
      </Section>
    </div>
  )
}

/** A chart's key: what each color is, drawn as the mark it is (line, area, band or bar). */
function Legend({ items }: { items: [string, string, "line" | "area" | "band" | "bar" | "dot" | "ring"][] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
      {items.map(([label, color, mark]) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={mark === "line" ? "h-0.5 w-3.5 rounded-full" : mark === "bar" ? "size-2.5 rounded-sm" : mark === "dot" || mark === "ring" ? "size-2.5 rounded-full" : "h-2.5 w-3.5 rounded-sm"} style={mark === "ring" ? { border: `1px solid ${color}` } : { background: color, opacity: mark === "band" ? 0.4 : mark === "area" ? 0.7 : 1 }} />
          {label}
        </li>
      ))}
    </ul>
  )
}
