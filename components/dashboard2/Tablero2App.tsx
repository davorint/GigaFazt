"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { localToday } from "@/lib/clients/from-lead"
import { demoSet } from "@/lib/interno/dashboard-demo"
import type { NetworkFigures } from "@/lib/interno/dashboard-server"
import { lastMonths, monthNumbers, siteNumbers } from "@/lib/interno/numbers"
import { BETTER_HIGH, compareRows, faultMatrix, faultQuake, faultsPer10, MEASURES, payPrints, revenueTree, scoreBoard, type Leaf, type Measure, type ScoreRow } from "@/lib/interno/tablero2-x"
import { linkSpeed } from "@/lib/wispdavor/capacity"
import { siteLabel } from "@/lib/sites/model"
import { forecast } from "@/lib/interno/outlook"
import { cohorts, moneyFlow, mrrAt, mrrBridge, payCalendar, payWindow, retentionAt, type FlowKind } from "@/lib/interno/tablero2"
import { FLOW_STATES, lightRows, recovered, REPAIR_GROUPS, repairLanes, revenueStreams, skyline, statusFlows, tenure, type RepairBar, type Star } from "@/lib/interno/tablero2-more"
import { demoCarriers } from "@/lib/interno/tablero2-demo"
import { demoLive, liveNet, type LiveFigures, type SiteState } from "@/lib/interno/tablero2-live"
import { leavesOf, margins as siteMargins, paidShare, stats } from "@/lib/interno/tablero2-tree"
import { buildSites } from "@/lib/interno/buildings"
import { subscribeSync, syncSnapshot } from "@/lib/sync/engine"
import { carrierOf, continuityStrip, gatewayStats, hourglass, saturation, type CarrierFigures, type Cell, type GatewayHour } from "@/lib/interno/tablero2-net"
import { mxn } from "@/lib/materials/catalog"
import { reportsStore } from "@/lib/reports/store"
import { addMonths } from "@/lib/payments/model"
import { FULL_SHARE } from "@/lib/wispdavor/capacity"
import { useWispData } from "@/components/wispdavor/useWispData"
import { Panel } from "@/components/dashboard/Panel"
import { INK, SERIES } from "@/components/dashboard/theme"
import { CapacityBars } from "./CapacityBars"
import { FaultQuake } from "./FaultQuake"
import { BAND_COLOR, HorizonChart } from "./HorizonChart"
import { SCORE_COLOR, ScoreBoard } from "./ScoreBoard"
import { CHANNEL_COLOR, MONTH_COLOR, PaymentDays, StageBar, TicketDays } from "./TodayCharts"
import { CHANNELS, MONTH_STATES, ONLINE_KINDS, paymentsByDay, ticketFigures } from "@/lib/interno/tablero2-today"
import { PayContours } from "./PayContours"
import { MARGIN_COLOR, TONE_COLOR, TowerView, type TowerLabels } from "./TowerView"
import { LIVE_COLOR, LiveNetwork, type LiveLabels } from "./LiveNetwork"
import { CarrierPulse } from "./CarrierPulse"
import { CELL_COLOR, ContinuityStrips } from "./ContinuityStrips"
import { PacketPath } from "./PacketPath"
import { SaturationForecast } from "./SaturationForecast"
import { SpeedHourglass } from "./SpeedHourglass"
import { CohortGrid } from "./CohortGrid"
import { clipName, k, monthName, pct, pesos, short, signed } from "./format"
import { MoneySankey } from "./MoneySankey"
import { MovesChart } from "./MovesChart"
import { MrrWaterfall } from "./MrrWaterfall"
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

/** A figure in the "Hoy" panels: a label (with its color key when it has one), the number, a line under it. */
function Stat({ label, value, sub, color, strong = false }: { label: string; value: string; sub: string; color?: string; strong?: boolean }) {
  return (
    <div className={`grid min-w-0 content-start gap-0.5 rounded-xl border p-3 ${strong ? "border-red-400/30 bg-red-400/[0.06]" : "border-white/5 bg-white/[0.02]"}`}>
      <p className="flex min-h-[2.5em] min-w-0 items-start gap-1.5 text-xs leading-tight text-zinc-400 sm:min-h-0">
        {color && <span aria-hidden className="mt-px size-2.5 shrink-0 rounded-sm" style={{ background: color }} />}
        <span className="min-w-0">{label}</span>
      </p>
      <p className="text-2xl font-light tracking-tight text-zinc-50 tabular-nums">{value}</p>
      <p className="text-[0.7rem] text-zinc-400">{sub}</p>
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
  // La red viva (owner, 2026-11-27): the network's minute, read every minute while the tab is visible.
  const [liveFig, setLiveFig] = useState<LiveFigures | null | "error">(null)
  const [liveBusy, setLiveBusy] = useState(false)
  const [livePick, setLivePick] = useState<string | null>(null)
  const saver = useSyncExternalStore(subscribeSync, () => syncSnapshot().saver, () => false)
  const saverRef = useRef(saver)
  useEffect(() => {
    saverRef.current = saver
  }, [saver])
  const [nowHour, setNowHour] = useState<number | null>(null)
  const [nowMs, setNowMs] = useState(0)
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const today = d.loaded ? localToday() : ""
  const sim = useMemo(() => (demo && today ? demoSet(today) : null), [demo, today])
  const src = useMemo(() => sim ?? { clients: d.clients, payments: d.payments, sites: d.sites, surveys: d.surveys, reports: reports.list }, [sim, d.clients, d.payments, d.sites, d.surveys, reports.list])

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

  const loadLive = useCallback(
    () =>
      fetch("/api/interno/tablero2/vivo", { cache: "no-store" })
        .then(async (r) => {
          const b = (await r.json()) as { live?: LiveFigures }
          setLiveFig(r.ok && b.live ? b.live : "error")
        })
        .catch(() => setLiveFig("error")),
    []
  )
  const refreshLive = async () => {
    setLiveBusy(true)
    await loadLive()
    setLiveBusy(false)
  }
  // Every minute, only while the tab is visible and the team's automatic syncing is on (saving mode stops it);
  // coming back to the tab reads it again.
  useEffect(() => {
    if (demo) return
    void loadLive()
    const id = window.setInterval(() => document.visibilityState === "visible" && !saverRef.current && void loadLive(), 60_000)
    const back = () => document.visibilityState === "visible" && !saverRef.current && void loadLive()
    document.addEventListener("visibilitychange", back)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", back)
    }
  }, [demo, loadLive])

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
  const cal = useMemo(() => (today ? payCalendar(src.payments, today, 26) : null), [src, today])
  const nodeName = useCallback((kind: FlowKind, label: string) => (kind === "plan" || kind === "site" ? label : t(`flow.nodes.${kind}`)), [t])
  // Second round (owner, 2026-11-22: "more, way more impressive").
  const streams = useMemo(() => revenueStreams(src.clients, months), [src, months])
  const flowMonths = useMemo(() => (cur ? lastMonths(cur, Math.min(period, 6)) : []), [cur, period])
  const flows = useMemo(() => (today ? statusFlows(src.clients, src.payments, flowMonths, today) : null), [src, flowMonths, today])
  const sky = useMemo(() => skyline(src.sites, src.clients, today), [src, today])
  const light = useMemo(() => lightRows(src.sites, src.clients), [src])
  const stars = useMemo(() => (today ? tenure(src.clients, src.sites, today) : []), [src, today])
  // Hoy (owner, 2026-11-24): today's payments by channel and the tickets.
  const dayShort = (dd: string) => new Date(`${dd}T12:00:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" })
  const payDays = useMemo(() => (today ? paymentsByDay(src.payments, today, 14) : null), [src, today])
  const tickets = useMemo(() => (today && nowMs ? ticketFigures(src.reports, today, nowMs) : null), [src, today, nowMs])
  const repairs = useMemo(() => (nowMs ? repairLanes(src.reports, src.sites, nowMs, 90) : null), [src, nowMs])
  // Third round (owner, 2026-11-22: carriers, speed of service, continuity, and a suggestion).
  const carriers = useMemo(() => (sim ? (nowMs ? demoCarriers(sim, nowMs) : null) : carrierNet && carrierNet !== "error" ? carrierNet : null), [sim, nowMs, carrierNet])
  const strips = useMemo(() => (carriers && nowMs ? carriers.continuity.map((c) => ({ c, strip: continuityStrip(c, nowMs) })) : []), [carriers, nowMs])
  const forecasts = useMemo(() => (carriers && today ? saturation(src.sites, carriers.daily, today) : []), [carriers, src, today])
  // Fourth round (owner, 2026-11-23: "5 more custom made, cutting edge").
  const tree = useMemo(() => (today ? revenueTree(src.sites, src.clients, src.payments, today) : null), [src, today])
  // Mapa de ingresos as towers (owner 2026-11-28): every deployment built floor by floor, clients in their apartments.
  const built = useMemo(() => (tree && today ? buildSites(src.sites, src.surveys, src.clients, new Map(leavesOf(tree).map((l) => [l.id, l])), src.reports, today) : []), [tree, src, today])
  const liveFigures = useMemo(() => (sim ? (nowMs ? demoLive(sim, nowMs) : null) : liveFig && liveFig !== "error" ? liveFig : null), [sim, nowMs, liveFig])
  const lnet = useMemo(() => (today ? liveNet(src.sites, src.clients, today, liveFigures) : null), [src, today, liveFigures])
  const chordM = useMemo(() => (nowMs ? faultMatrix(src.reports, src.sites, nowMs, 90) : null), [src, nowMs])
  const prints = useMemo(() => (today ? payPrints(src.payments, src.clients, today, 12, 10) : null), [src, today])
  const siteRows = useMemo(() => siteNumbers(src.sites, src.clients), [src])
  const quake = useMemo(() => (nowMs ? faultQuake(src.reports, src.sites, new Map(src.clients.map((c) => [c.id, c.name.trim()])), new Map(siteRows.map((x) => [x.id, x.active])), nowMs, 90) : null), [src, siteRows, nowMs])
  const streamName = useCallback((key: string) => (key === "__tv" ? t("streams.tv") : key === "__otros" ? t("streams.otros") : key), [t])
  const streamColor = useCallback((key: string) => SERIES[streams.keys.indexOf(key)] ?? INK.muted, [streams.keys])

  if (!d.loaded || !reports.loaded || !fc || !bridge || !cal || !flows || !repairs || !payDays || !tickets || !rows.length) return <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>

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
  // La red viva: live data on screen (some router reporting), the median carrier latency, the labels.
  const liveOn = !!lnet && lnet.sites.some((x) => x.state !== "nodata")
  const liveRtts = (lnet?.sites ?? []).map((x) => x.rtt).filter((v): v is number => v !== null).sort((a, b) => a - b)
  const liveRtt = liveRtts.length ? liveRtts[Math.floor(liveRtts.length / 2)] : null
  const stateColor = (x: SiteState) => (x === "outage" || x === "saturated" ? LIVE_COLOR.outage : x === "silent" ? LIVE_COLOR.silent : x === "full" ? LIVE_COLOR.full : x === "nodata" ? LIVE_COLOR.nodata : LIVE_COLOR.online)
  const liveLabels: LiveLabels = {
    mbps: speedText,
    ms,
    state: (x) => t(`live.states.${x}`),
    noLink: t("live.noLink"),
    noName: t("live.noName"),
    noTower: t("live.noTower"),
    rows: { online: t("live.rows.online"), traffic: t("live.rows.traffic"), use: t("live.rows.use"), latency: t("live.rows.latency"), loss: t("live.rows.loss"), light: t("live.rows.light"), links: t("live.rows.links"), towers: t("live.rows.towers"), state: t("live.rows.state"), capacity: t("live.rows.capacity"), sites: t("live.rows.sites") },
    lightProblems: (justo, bad) => t("live.lightProblems", { justo, bad }),
  }
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
  // Mapa de ingresos (owner, 2026-11-27): margins from Números, paid share, the best and the losing deployment.
  const treeMargins = siteMargins(siteRows)
  const treeStats = tree ? stats(tree) : null
  const treeSites = siteRows.filter((x) => x.income > 0).map((x) => ({ name: x.name, margin: x.profit / x.income, profit: x.profit }))
  const treeLoss = treeSites.filter((x) => x.profit < 0).sort((a, b) => a.profit - b.profit)[0]
  const treeBest = [...treeSites].sort((a, b) => b.margin - a.margin)[0]
  const builtShown = built.reduce((a, x) => a + x.residents, 0)
  const towerLabels: TowerLabels = {
    view: { fachada: t("tower.view.fachada"), plano: t("tower.view.plano"), label: t("tower.view.label"), detailed: t("tower.view.detailed") },
    zoom: { title: (floor, tower) => t("tower.zoom.title", { floor, tower }), up: t("tower.zoom.up"), down: t("tower.zoom.down"), hint: t("tower.zoom.hint") },
    fields: { label: t("tower.fields.label"), cliente: t("tower.fields.cliente"), estado: t("tower.fields.estado"), plan: t("tower.fields.plan"), monto: t("tower.fields.monto"), luz: t("tower.fields.luz"), reportes: t("tower.fields.reportes") },
    sites: `${t("tree.title")}: ${t("tree.lists.sites")}`,
    tower: (n) => n || t("tower.oneTower"),
    floor: (n) => t("tower.floor", { n }),
    floorCol: t("tower.floorCol"),
    basement: (n) => t("tower.basement", { n }),
    street: t("tower.street"),
    monthly: t("tree.monthly"),
    occupancy: (n, of) => t("tower.occupancy", { n, of }),
    month: t("tree.month"),
    paidShare: (share) => t("tree.paidShare", { share }),
    tones: { "al-corriente": t("tree.tones.paid"), "por-vencer": t("tree.tones.due"), atrasado: t("tree.tones.late"), suspendido: t("tree.tones.suspended"), "sin-cobro": t("rings.tones.sin-cobro") },
    margin: (share) => t("tower.margin", { share }),
    towers: t("tree.lists.towers"),
    empty: (l) => l,
    apt: {
      title: (label) => t("tower.apt.title", { label }),
      client: t("tower.apt.client"),
      status: t("tower.apt.status"),
      plans: t("tower.apt.plans"),
      pays: t("tower.apt.pays"),
      light: t("tower.apt.light"),
      lightValue: (rx, status) => t("tower.apt.lightValue", { rx: rx.toLocaleString("es-MX", { maximumFractionDigits: 1 }), status }),
      noLight: t("tower.apt.noLight"),
      reports: t("tower.apt.reports"),
      reportsValue: (n, kind) => t("tower.apt.reportsValue", { n, kind }),
      none: t("tower.apt.none"),
      occupied: t("tower.apt.occupied"),
      guessed: (written) => (written ? t("tower.apt.guessed", { written }) : t("tower.apt.unwritten")),
      pick: t("tower.apt.pick"),
      close: t("tower.apt.close"),
    },
    lightStatus: { baja: t("light.zones.baja"), justo: t("light.zones.justo"), bien: t("light.zones.bien"), satura: t("light.zones.satura") },
    reportKind: (k) => t(`tower.reportKinds.${k}`),
    source: { levantamiento: t("tower.source.levantamiento"), despliegue: t("tower.source.despliegue"), estimado: t("tower.source.estimado") },
    overflow: (n) => t("tower.overflow", { n }),
    misplaced: (n) => t("tower.misplaced", { n }),
    svg: (x) => t("tower.svg", x),
  }

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
  // Every deployment against the median of all of them (the scoreboard), best first.
  const board = scoreBoard(compare)
  const measuredOf = (r: ScoreRow) => MEASURES.filter((m) => r.cells[m].value !== null).length
  const boardBest = board.rows[0]
  const boardWorst = board.rows[board.rows.length - 1]
  const scoreText = (r: ScoreRow) => (r.score > 0 ? `+${r.score}` : r.score < 0 ? `−${Math.abs(r.score)}` : "0")
  const boardTip = (r: ScoreRow, m: Measure) => {
    const c = r.cells[m]
    const md = board.medians[m]
    const vs = c.value === null ? "—" : c.dev === 0 ? t("compare.tip.same") : t(c.dev > 0 ? "compare.tip.better" : "compare.tip.worse", { d: fmtMeasure(m, Math.abs(c.dev)) })
    return {
      title: `${r.name} · ${t(`compare.axes.${m}`)}`,
      rows: [
        { label: t("compare.tip.value"), value: c.value === null ? t("compare.tip.none") : fmtMeasure(m, c.value) },
        ...(c.value === null ? [] : [{ label: t("compare.tip.place"), value: t("compare.tip.rank", { rank: c.rank, of: c.of }) }]),
        ...(c.value === null || md === null ? [] : [{ label: t("compare.tip.median", { v: fmtMeasure(m, md) }), value: vs, color: c.dev > 0 ? SCORE_COLOR.better : c.dev < 0 ? SCORE_COLOR.worse : undefined }]),
      ],
    }
  }
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
          title={t("live.title")}
          takeaway={lnet ? (liveOn ? t("live.takeaway", { online: lnet.totals.online ?? 0, live: lnet.totals.live, use: pct(lnet.totals.use !== null && lnet.totals.capacity ? lnet.totals.use / lnet.totals.capacity : null), alerts: lnet.totals.outages + lnet.totals.full }) : t("live.takeawayNoLive")) : undefined}
          empty={lnet && lnet.sites.length ? null : t("empty.clients")}
          tableLabel={tl}
          table={{
            head: [t("live.cols.site"), t("live.cols.carriers"), t("live.cols.online"), t("live.cols.traffic"), t("live.cols.use"), t("live.cols.latency"), t("live.cols.state")],
            rows: (lnet?.sites ?? []).map((x) => [x.name, x.links.map((l) => l.carrier || t("live.noName")).join(", ") || t("live.noLink"), x.online === null ? `— / ${x.live}` : `${x.online} / ${x.live}`, x.use === null ? "—" : `${speedText(x.use)}${x.capacity ? ` / ${speedText(x.capacity)}` : ""}`, pct(x.share), x.rtt === null ? "—" : ms(x.rtt), t(`live.states.${x.state}`)]),
          }}
        >
          {lnet && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <LiveStat label={t("live.stats.online")} value={lnet.totals.online === null ? "—" : String(lnet.totals.online)} hint={t("live.stats.onlineOf", { n: lnet.totals.live })} />
                <LiveStat label={t("live.stats.traffic")} value={lnet.totals.use === null ? "—" : speedText(lnet.totals.use)} hint={lnet.totals.capacity ? t("live.stats.trafficOf", { cap: speedText(lnet.totals.capacity), share: pct(lnet.totals.use !== null ? lnet.totals.use / lnet.totals.capacity : null) }) : "—"} />
                <LiveStat label={t("live.stats.latency")} value={liveRtt === null ? "—" : ms(liveRtt)} hint={lnet.totals.worst ? t("live.stats.latencyWorst", { name: clipName(lnet.totals.worst.name, 18), ms: ms(lnet.totals.worst.rtt) }) : "—"} />
                <LiveStat label={t("live.stats.alerts")} value={String(lnet.totals.outages + lnet.totals.full)} hint={lnet.totals.outages + lnet.totals.full ? t("live.stats.alertsSome", { outages: lnet.totals.outages, full: lnet.totals.full }) : t("live.stats.alertsNone")} alert={lnet.totals.outages > 0 ? LIVE_COLOR.outage : lnet.totals.full > 0 ? LIVE_COLOR.full : undefined} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-zinc-400">
                <span className="inline-flex items-center gap-1.5" aria-live="polite">
                  {saver && !sim ? (
                    t("live.paused")
                  ) : liveFig === "error" && !sim ? (
                    <span className="text-amber-200">{t("live.error")}</span>
                  ) : (
                    <>
                      <span aria-hidden className="relative inline-flex size-2">
                        <span className="t2-ping absolute inset-0 rounded-full" style={{ background: LIVE_COLOR.online }} />
                        <span className="relative size-2 rounded-full" style={{ background: LIVE_COLOR.online }} />
                      </span>
                      {t("live.badge")}
                      {liveFigures ? ` · ${t("live.updated", { time: new Date(liveFigures.now).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }) })}` : ""}
                    </>
                  )}
                </span>
                <button type="button" onClick={() => (sim ? setNowMs(Date.now()) : void refreshLive())} disabled={liveBusy} className="inline-flex min-h-8 items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none disabled:opacity-50">
                  {liveBusy ? t("live.refreshing") : t("live.refresh")}
                </button>
              </div>
              <LiveNetwork net={lnet} label={t("live.title")} labels={liveLabels} selected={livePick} onSelect={(id) => setLivePick((p) => (p === id ? null : id))} />
              <div role="group" aria-label={t("live.sites")} className="flex flex-wrap justify-center gap-1.5">
                {lnet.sites.map((x) => (
                  <button key={x.id} type="button" aria-pressed={livePick === x.id} onClick={() => setLivePick((p) => (p === x.id ? null : x.id))} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${livePick === x.id ? "border-white/40 bg-white/10 text-zinc-50" : "border-white/10 text-zinc-300 hover:bg-white/5"}`}>
                    <span aria-hidden className="size-2 rounded-full" style={{ background: stateColor(x.state) }} />
                    {x.name}
                    <span className="sr-only">: {t(`live.states.${x.state}`)}</span>
                  </button>
                ))}
              </div>
              <Legend items={[[t("live.legend.flow"), LIVE_COLOR.flow, "line"], [t("live.legend.full"), LIVE_COLOR.full, "line"], [t("live.legend.saturated"), LIVE_COLOR.saturated, "line"], [t("live.legend.online"), LIVE_COLOR.online, "ring"], [t("live.legend.justo"), LIVE_COLOR.justo, "dot"], [t("live.legend.bad"), LIVE_COLOR.bad, "dot"]]} />
              <p className="text-[0.7rem] text-zinc-500">{t("live.note")}</p>
            </>
          )}
        </Panel>
        <section aria-label={t("kpi.title")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <Kpi demo={tag} label={t("kpi.mrr")} value={pesos(mrrNow)} hint={t("kpi.mrrHint", { d: `${mrrNow - mrrPrev >= 0 ? "+" : "−"}${pesos(Math.abs(mrrNow - mrrPrev))}` })} trend={mrrYear} color={SERIES[0]} />
          <Kpi demo={tag} label={t("kpi.collected")} value={pesos(now.collected)} hint={t("kpi.collectedHint", { pct: pct(now.rate), billed: pesos(now.expected) })} trend={yearRows.map((r) => r.collected)} color={SERIES[1]} />
          <Kpi demo={tag} label={t("kpi.profit")} value={pesos(flow.profit)} hint={t("kpi.profitHint", { income: k(flow.income), costs: k(flow.costs) })} trend={[]} color={SERIES[2]} meter={{ share: flow.income ? flow.profit / flow.income : 0, label: t("kpi.profitMeter", { margin: pct(flow.income ? flow.profit / flow.income : null) }) }} />
          <Kpi demo={tag} label={t("kpi.retention")} value={pct(r3)} hint={r3 === null ? t("kpi.retentionNone") : t("kpi.retentionHint")} trend={r3Trend} color={SERIES[3]} />
        </section>
      </div>

      <Section id="t2-today" title={t("sections.today")}>
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {(() => {
            const day = payDays.days[payDays.days.length - 1]
            const dayTitle = (dd: string) => new Date(`${dd}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
            return (
              <Panel
                demo={tag}
                title={t("today.pay.title")}
                takeaway={day.total.n ? t("today.pay.takeaway", { n: day.total.n, amount: mxn(day.total.amount), online: day.by.linea.n, transfers: day.by.transferencia.n, other: day.by.otros.n }) : t("today.pay.none")}
                tableLabel={tl}
                table={{ head: [t("cols.day"), ...CHANNELS.map((c) => t(`today.pay.channels.${c}`)), t("cols.amount")], rows: [...payDays.days].reverse().map((x) => [dayShort(x.day), ...CHANNELS.map((c) => x.by[c].n), mxn(x.total.amount)]) }}
              >
                <div className="grid min-w-0 grid-cols-3 gap-2">
                  {CHANNELS.map((c) => (
                    <Stat key={c} color={CHANNEL_COLOR[c]} label={t(`today.pay.channels.${c}`)} value={String(day.by[c].n)} sub={mxn(day.by[c].amount)} />
                  ))}
                </div>
                <p className="text-xs text-zinc-400">
                  {t("today.pay.onlineKinds")}{" "}
                  {ONLINE_KINDS.map((o, i) => (
                    <span key={o}>
                      {i > 0 && " · "}
                      {t(`today.pay.kinds.${o}`)} <span className="font-mono tabular-nums text-zinc-100">{payDays.online[o].n}</span>
                    </span>
                  ))}
                </p>
                <PaymentDays days={payDays.days} today={today} label={t("today.pay.chart")} channelLabel={(c) => t(`today.pay.channels.${c}`)} dayTitle={dayTitle} money={mxn} countLabel={(n) => t("today.pay.count", { n })} todayLabel={t("today.today")} />
                <Legend items={CHANNELS.map((c) => [t(`today.pay.channels.${c}`), CHANNEL_COLOR[c], "bar"] as [string, string, "bar"])} />
                <p className="text-[0.7rem] text-zinc-500">{t("today.pay.note")}</p>
              </Panel>
            )
          })()}
          {(() => {
            const dayTitle = (dd: string) => new Date(`${dd}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })
            const monthNow = monthName(cur)
            const vs = tickets.month.total - tickets.lastMonthSoFar
            return (
              <Panel
                demo={tag}
                title={t("today.tickets.title")}
                takeaway={tickets.open.total ? t("today.tickets.takeaway", { open: tickets.open.total, pending: tickets.open.nuevo, oldest: dur(tickets.oldestHours ?? 0), month: tickets.month.total, monthName: monthNow }) : t("today.tickets.none", { month: tickets.month.total, monthName: monthNow })}
                tableLabel={tl}
                table={{ head: [t("cols.day"), ...MONTH_STATES.map((x) => t(`today.tickets.states.${x}`))], rows: tickets.days.filter((x) => !x.future).reverse().map((x) => [dayShort(x.day), ...MONTH_STATES.map((st) => x.by[st])]) }}
              >
                <div className="grid min-w-0 grid-cols-3 gap-2">
                  <Stat label={t("today.tickets.open")} value={String(tickets.open.total)} sub={tickets.stale ? t("today.tickets.stale", { n: tickets.stale }) : t("today.tickets.fresh")} />
                  <Stat label={t("today.tickets.pending")} value={String(tickets.open.nuevo)} sub={t("today.tickets.pendingHint")} strong={tickets.open.nuevo > 0} />
                  <Stat label={t("today.tickets.month", { month: monthNow })} value={String(tickets.month.total)} sub={t(vs > 0 ? "today.tickets.vsMore" : vs < 0 ? "today.tickets.vsLess" : "today.tickets.vsSame", { n: Math.abs(vs), last: tickets.lastMonthSoFar })} />
                </div>
                <StageBar open={tickets.open} stageLabel={(x) => t(`today.tickets.stages.${x}`)} />
                <p className="mt-1 text-xs text-zinc-400">{t("today.tickets.chart", { month: monthNow })}</p>
                <TicketDays days={tickets.days} today={today} label={t("today.tickets.chart", { month: monthNow })} stateLabel={(x) => t(`today.tickets.states.${x}`)} dayTitle={dayTitle} countLabel={(n) => t("today.tickets.count", { n })} todayLabel={t("today.today")} />
                <Legend items={MONTH_STATES.map((x) => [t(`today.tickets.states.${x}`), MONTH_COLOR[x], "bar"] as [string, string, "bar"])} />
                <p className="text-[0.7rem] text-zinc-500">{t("today.tickets.note")}</p>
              </Panel>
            )
          })()}
        </div>
      </Section>

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
          title={t("tree.title")}
          takeaway={packTop && packTotal && treeStats ? `${t("tree.takeaway", { top: packTop.name || t("pack.noSite"), share: pct(packTop.value / packTotal), amount: mxn(packTop.value), paid: pct(paidShare(treeStats)) })}${treeLoss ? ` ${t("tree.lossLine", { name: treeLoss.name, profit: pesos(treeLoss.profit) })}` : treeBest ? ` ${t("tree.marginLine", { best: treeBest.name, margin: pct(treeBest.margin) })}` : ""}` : undefined}
          empty={tree && tree.children.length ? null : t("pack.empty")}
          tableLabel={tl}
          table={{
            head: [t("tree.cols.site"), t("tree.cols.monthly"), t("tree.cols.share"), t("tree.cols.paid"), t("tree.cols.margin")],
            rows: [...packSites].sort((a, b) => b.value - a.value).map((x) => {
              const m = "id" in x.n ? treeMargins.get(x.n.id.slice(2)) : undefined
              return [x.name || t("pack.noSite"), mxn(x.value), pct(packTotal ? x.value / packTotal : null), pct(paidShare(stats(x.n))), m && m.margin !== null ? `${pct(m.margin)}${m.incomplete ? ` (${t("tree.rows.incomplete")})` : ""}` : "—"]
            }),
          }}
        >
          {built.length > 0 && <TowerView sites={built} margins={treeMargins} labels={towerLabels} />}
          {built.length === 0 && tree && tree.children.length > 0 && <p className="text-sm text-zinc-400">{t("tower.noApartments")}</p>}
          <Legend items={[[t("tree.legend.paid"), TONE_COLOR["al-corriente"], "dot"], [t("tree.legend.due"), TONE_COLOR["por-vencer"], "ring"], [t("tree.legend.late"), TONE_COLOR.atrasado, "dot"], [t("tree.legend.suspended"), TONE_COLOR.suspendido, "dot"], [t("tower.legend.empty"), "#14171c", "dot"], [t("tower.legend.guessed"), "#8fa3c2", "ring"], [t("tower.legend.report"), "#fab219", "dot"], [t("tower.legend.loss"), MARGIN_COLOR.loss, "hatch"]]} />
          {treeStats && treeStats.clients > builtShown && <p className="text-[0.7rem] text-zinc-500">{t("tower.hidden", { n: treeStats.clients - builtShown })}</p>}
          <p className="text-[0.7rem] text-zinc-500">{t("tree.note")}</p>
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
          takeaway={chordM && chordSites.length ? `${t("chord.takeaway", { site: chordSites[0].name || t("pack.noSite"), share: pct(chordSites[0].n / chordM.total), kind: t(`repairs.groups.${chordSites[0].top}`) })}${quake?.quickRepeat ? ` ${t("chord.quick", { n: quake.quickRepeat })}` : ""}` : undefined}
          empty={chordM && chordM.total ? null : t("chord.empty")}
          tableLabel={tl}
          table={quake ? { head: [t("cols.site"), ...REPAIR_GROUPS.map((x) => t(`repairs.groups.${x}`)), t("chord.total"), t("chord.per10"), t("chord.repeats")], rows: quake.lanes.map((x) => [x.name || t("pack.noSite"), ...x.byKind, x.total, x.per10 === null ? "—" : x.per10.toLocaleString("es-MX", { maximumFractionDigits: 1 }), x.repeats.length]) } : undefined}
        >
          {quake && quake.total > 0 && (
            <FaultQuake
              q={quake}
              label={t("chord.title")}
              labels={{
                all: t("chord.all"),
                kinds: t("chord.kinds"),
                kind: (x) => t(`repairs.groups.${x}`),
                site: (n) => n || t("pack.noSite"),
                pulse: t("chord.pulse"),
                now: t("chord.now"),
                rate: (n) => t("chord.rate", { n }),
                reports: (n) => t("chord.reports", { n }),
                trend: (v) => (v >= 1.25 ? t("chord.trendUp", { pct: pct(v - 1) }) : v <= 0.8 ? t("chord.trendDown", { pct: pct(1 - v) }) : t("chord.trendFlat")),
                event: (e) => (e.open ? t("chord.open", { d: dur(e.hours ?? 0) }) : e.hours === null ? t("chord.done") : t("chord.took", { d: dur(e.hours) })),
                day: (ms) => new Date(ms).toLocaleDateString("es-MX", { day: "numeric", month: "short" }),
                repeat: (d) => t("chord.repeat", { n: Math.round(d) }),
              }}
            />
          )}
          {quake && quake.total > 0 && <Legend items={[[t("chord.legend.open"), "#f0efec", "ring"] as [string, string, "ring"], ...(quake.repeatClients ? ([[t("chord.legend.quick"), "#c3c2b7", "line"], [t("chord.legend.slow"), "#898781", "line"]] as [string, string, "line"][]) : [])]} />}
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
          takeaway={compare.length >= 2 && boardBest && boardWorst && !boardBest.wins && !boardWorst.losses ? t("compare.takeawayEven") : compare.length >= 2 && boardBest && boardWorst ? t("compare.takeaway", { best: boardBest.name, n: boardBest.wins, of: measuredOf(boardBest), worst: boardWorst.name, m: boardWorst.losses, mOf: measuredOf(boardWorst) }) : undefined}
          // Peak use, latency and availability come from the network figures: wait for them, or the board would rank without them and re-sort when they land.
          empty={!sim && (net === null || carrierNet === null) ? t("loading") : compare.length >= 2 ? null : t("compare.empty")}
          tableLabel={tl}
          table={{ head: [t("cols.site"), t("compare.score"), ...MEASURES.map((m) => t(`compare.axes.${m}`))], rows: [...board.rows.map((r) => [r.name, scoreText(r), ...MEASURES.map((m) => (r.cells[m].value === null ? "—" : fmtMeasure(m, r.cells[m].value as number)))]), [t("compare.median"), "—", ...MEASURES.map((m) => (board.medians[m] === null ? "—" : fmtMeasure(m, board.medians[m] as number)))]] }}
        >
          <ScoreBoard
            board={board}
            label={t("compare.title")}
            axisLabel={(m) => t(`compare.axes.${m}`)}
            hint={(m, shortText) => t(`compare.better.${BETTER_HIGH[m] ? "high" : "low"}${shortText ? "Short" : ""}`)}
            medianLabel={t("compare.medianRow")}
            fmt={fmtMeasure}
            summary={(r) => t("compare.summary", { wins: r.wins, losses: r.losses })}
            tipFor={boardTip}
          />
          <Legend items={[[t("compare.legend.better"), SCORE_COLOR.better, "bar"], [t("compare.legend.worse"), SCORE_COLOR.worse, "bar"]]} />
          <p className="text-[0.7rem] text-zinc-500">{t("compare.note")}</p>
        </Panel>
      </Section>
    </div>
  )
}

/** A chart's key: what each color is, drawn as the mark it is (line, area, band or bar). */
/** One live reading above La red viva: label, value, a line under it; `alert` colors a small status mark. */
function LiveStat({ label, value, hint, alert }: { label: string; value: string; hint: string; alert?: string }) {
  return (
    <div className="grid content-start gap-0.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <p className="flex items-center gap-1.5 text-[0.7rem] text-zinc-400">
        {alert && <span aria-hidden className="size-1.5 rounded-full" style={{ background: alert }} />}
        {label}
      </p>
      <p className="font-mono text-lg tabular-nums text-zinc-50">{value}</p>
      <p className="truncate text-[0.7rem] text-zinc-500">{hint}</p>
    </div>
  )
}

function Legend({ items }: { items: [string, string, "line" | "area" | "band" | "bar" | "dot" | "ring" | "hatch"][] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300">
      {items.map(([label, color, mark]) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className={mark === "line" ? "h-0.5 w-3.5 rounded-full" : mark === "bar" || mark === "hatch" ? "size-2.5 rounded-sm" : mark === "dot" || mark === "ring" ? "size-2.5 rounded-full" : "h-2.5 w-3.5 rounded-sm"} style={mark === "ring" ? { border: `1px solid ${color}` } : mark === "hatch" ? { background: `repeating-linear-gradient(45deg, ${color} 0 2px, #2a2a28 2px 4px)` } : { background: color, opacity: mark === "band" ? 0.4 : mark === "area" ? 0.7 : 1 }} />
          {label}
        </li>
      ))}
    </ul>
  )
}
