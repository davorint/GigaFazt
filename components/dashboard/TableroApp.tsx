"use client"

import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { agendaStore } from "@/lib/agenda/store"
import { localToday } from "@/lib/clients/from-lead"
import { AGE_BUCKETS, installBacklog, lightHistogram, planMix, reportAges } from "@/lib/interno/dashboard"
import type { NetworkFigures } from "@/lib/interno/dashboard-server"
import { cancelReasons, churnRate, lastMonths, monthNumbers, siteNumbers } from "@/lib/interno/numbers"
import { forecast } from "@/lib/interno/outlook"
import { mxn } from "@/lib/materials/catalog"
import { addMonths } from "@/lib/payments/model"
import { reportsStore } from "@/lib/reports/store"
import { funnelMonth, funnelMonths, type FunnelEvent } from "@/lib/wispdavor/funnel"
import { FULL_SHARE } from "@/lib/wispdavor/capacity"
import { mapSites, type MapSite } from "@/lib/wispdavor/mapa"
import { useWispData } from "@/components/wispdavor/useWispData"
import { EChart } from "./EChart"
import { Panel } from "./Panel"
import { INK, ORDINAL, SEQUENTIAL, SERIES, STATUS, bar, categoryAxis, grid, legend, line, valueAxis } from "./theme"

// MapLibre loads only here (its own chunk), like on the WispDavor map.
const ClientsMap = dynamic(() => import("@/components/wispdavor/ClientsMap"), { ssr: false, loading: () => <div aria-hidden className="h-[320px] rounded-xl border border-white/10" /> })

const PERIODS = [6, 12, 24] as const
const short = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "short", year: "2-digit" })
const k = (n: number) => {
  const a = Math.abs(n)
  const v = a >= 1000 ? `$${(a / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(a)}`
  return n < 0 ? `−${v}` : v
}
const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 1000) / 10} %`)
const DAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]

/** A stat with its 12-month trend (one series: the title names it, no legend). */
function Tile({ label, value, hint, trend, color = SERIES[0], tone = "" }: { label: string; value: string; hint: string; trend: (number | null)[]; color?: string; tone?: string }) {
  const option = useMemo(
    () => ({
      grid: { top: 4, right: 2, bottom: 2, left: 2 },
      xAxis: { type: "category", show: false, data: trend.map((_, i) => i) },
      yAxis: { type: "value", show: false, scale: true },
      tooltip: { show: false },
      series: [line(label, trend, color, { areaStyle: { color, opacity: 0.12 }, emphasis: { disabled: true } })],
    }),
    [trend, color, label]
  )
  return (
    <div className="grid gap-1 rounded-2xl border border-white/10 bg-[#0e0e10] p-4">
      <p className="text-xs text-zinc-400">{label}</p>
      <p className={`text-3xl font-light text-zinc-50 ${tone}`}>{value}</p>
      <p className="text-xs text-zinc-400">{hint}</p>
      {trend.length > 0 && <EChart option={option} height={44} label={`${label}: ${value}. ${hint}`} />}
    </div>
  )
}

/**
 * /interno/admin/tablero (owner, 2026-11-22: "a stunning dashboard with Apache ECharts", all five sections): money,
 * clients, network, map and operations at a glance, from the records this phone syncs and the network figures
 * (/api/interno/tablero). Each chart has a takeaway and its numbers as a table.
 */
export function TableroApp() {
  const t = useTranslations("tablero")
  const d = useWispData()
  const reports = useSyncExternalStore(reportsStore.subscribe, reportsStore.snapshot, reportsStore.serverSnapshot)
  const agenda = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot)
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(12)
  const [net, setNet] = useState<NetworkFigures | null | "error">(null)
  const [events, setEvents] = useState<FunnelEvent[] | null>(null)
  const loaded = d.loaded && reports.loaded && agenda.loaded
  const today = loaded ? localToday() : ""

  useEffect(() => {
    let live = true
    fetch("/api/interno/tablero", { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { network?: NetworkFigures }
        if (live) setNet(r.ok && b.network ? b.network : "error")
      })
      .catch(() => live && setNet("error"))
    return () => {
      live = false
    }
  }, [])
  const funnelMonthNow = today ? funnelMonths(today, 1)[0] : ""
  useEffect(() => {
    if (!funnelMonthNow) return
    let live = true
    fetch(`/api/interno/embudo?desde=${addMonths(funnelMonthNow, -3)}-01`, { cache: "no-store" })
      .then(async (r) => {
        const b = (await r.json()) as { events?: FunnelEvent[] }
        if (live) setEvents(r.ok ? (b.events ?? []) : [])
      })
      .catch(() => live && setEvents([]))
    return () => {
      live = false
    }
  }, [funnelMonthNow])

  const months = useMemo(() => (today ? lastMonths(today.slice(0, 7), period) : []), [today, period])
  const rows = useMemo(() => (loaded ? monthNumbers(d.clients, d.payments, reports.list, months) : []), [loaded, d.clients, d.payments, reports.list, months])
  const year = useMemo(() => (loaded ? monthNumbers(d.clients, d.payments, reports.list, lastMonths(today.slice(0, 7), 12)) : []), [loaded, d.clients, d.payments, reports.list, today])
  const fc = useMemo(() => (rows.length ? forecast(d.clients, year, today.slice(0, 7)) : null), [rows.length, d.clients, year, today])
  const sites = useMemo(() => (loaded ? siteNumbers(d.sites, d.clients) : []), [loaded, d.sites, d.clients])
  const funnel = useMemo(() => (events && loaded && funnelMonthNow ? funnelMonth(d.clients, d.payments, events, funnelMonthNow, today) : null), [events, loaded, d.clients, d.payments, funnelMonthNow, today])
  const reasons = useMemo(() => (loaded ? cancelReasons(d.clients, months) : []), [loaded, d.clients, months])
  const mix = useMemo(() => (loaded ? planMix(d.clients) : null), [loaded, d.clients])
  const light = useMemo(() => (loaded ? lightHistogram(d.clients) : null), [loaded, d.clients])
  const ages = useMemo(() => (loaded ? reportAges(reports.list) : null), [loaded, reports.list])
  const backlog = useMemo(() => (loaded ? installBacklog(agenda.list, today) : null), [loaded, agenda.list, today])
  const mapRows = useMemo<MapSite[]>(() => (loaded ? mapSites(d.sites, d.surveys, d.clients, d.payments, today) : []), [loaded, d.sites, d.surveys, d.clients, d.payments, today])

  if (!loaded || !fc || !mix || !light || !ages || !backlog) return <p className="mt-6 text-sm text-zinc-400">{t("loading")}</p>
  const labels = rows.map((r) => short(r.month))
  const now = year[year.length - 1]
  const prev = year[year.length - 2]
  const churnYear = year.map((_, i) => (i ? churnRate(year, i) : null))
  const network = net && net !== "error" ? net : null
  const tl = t("table")

  // ── Money ──
  const moneyOption = {
    grid: grid({ top: 36, right: 48 }),
    legend: legend(),
    tooltip: { trigger: "axis", valueFormatter: (v: number) => mxn(v) },
    xAxis: categoryAxis(labels),
    yAxis: valueAxis(k, { minInterval: 1 }),
    series: [line(t("money.billed"), rows.map((r) => r.expected), SERIES[0]), line(t("money.collected"), rows.map((r) => r.collected), SERIES[1], { endLabel: { show: true, color: INK.secondary, formatter: (p: { value: number }) => k(p.value) } })],
  }
  const hist = year.slice(-6)
  const fLabels = [...hist.map((r) => short(r.month)), ...fc.rows.map((r) => short(r.month))]
  // The band starts at this month's point (both bounds = what it bills), so it continues the history line.
  const last = hist[hist.length - 1]?.expected ?? 0
  const pad = (xs: (number | null)[], start: number) => [...Array(hist.length - 1).fill(null), start, ...xs]
  const forecastOption = {
    grid: grid({ top: 36 }),
    // The range's marker is a filled, lighter block like the band itself (the line keeps the line marker).
    legend: legend({ data: [{ name: t("forecast.actual") }, { name: t("forecast.range"), icon: "rect", itemStyle: { color: SERIES[0], opacity: 0.45 } }], itemHeight: 8 }),
    tooltip: {
      trigger: "axis",
      // The band is stacked (low + gap): the tooltip says both bounds as amounts, not the gap.
      formatter: (ps: { dataIndex: number; axisValue: string }[]) => {
        const i = ps[0]?.dataIndex ?? 0
        const f = fc.rows[i - hist.length]
        return f
          ? `${ps[0].axisValue}<br/>${t("forecast.high")}: <b>${mxn(f.scheduled)}</b><br/>${t("forecast.low")}: <b>${mxn(f.withChurn)}</b>`
          : `${ps[0]?.axisValue ?? ""}<br/>${t("forecast.actual")}: <b>${mxn(hist[i]?.expected ?? 0)}</b>`
      },
    },
    xAxis: categoryAxis(fLabels, { boundaryGap: false }),
    yAxis: valueAxis(k, { minInterval: 1 }),
    series: [
      line(t("forecast.actual"), [...hist.map((r) => r.expected), ...fc.rows.map(() => null)], SERIES[0], { showSymbol: true, symbolSize: 6 }),
      // The band: from "with the average cancellations" up to "nobody leaves" (stacked: base invisible, then the gap).
      line(t("forecast.low"), pad(fc.rows.map((r) => r.withChurn), last), SERIES[0], { stack: "band", lineStyle: { width: 1, opacity: 0.6 }, symbol: "none" }),
      line(t("forecast.range"), pad(fc.rows.map((r) => Math.round((r.scheduled - r.withChurn) * 100) / 100), 0), SERIES[0], { stack: "band", lineStyle: { width: 1, opacity: 0.6 }, areaStyle: { color: SERIES[0], opacity: 0.35 }, symbol: "none" }),
    ],
  }
  const profitSorted = [...sites].sort((a, b) => a.profit - b.profit)
  const profitOption = {
    grid: grid({ left: 4, right: 24 }),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => mxn(v) },
    xAxis: valueAxis(k, { minInterval: 1, splitNumber: 3 }),
    yAxis: categoryAxis(profitSorted.map((s) => s.name), { axisLabel: { color: INK.secondary, width: 130, overflow: "truncate" } }),
    series: [
      bar(
        t("money.profit"),
        profitSorted.map((s) => ({ value: Math.round(s.profit), itemStyle: { color: s.profit < 0 ? STATUS.critical : SERIES[0], borderRadius: s.profit < 0 ? [4, 0, 0, 4] : [0, 4, 4, 0] } })),
        SERIES[0],
        { barMaxWidth: 16, itemStyle: {} }
      ),
    ],
  }
  const stages = funnel ? [t("funnel.late"), t("funnel.notified"), t("funnel.suspended"), t("funnel.paid")] : []
  const stageValues = funnel ? [funnel.late, funnel.notified, funnel.suspended, funnel.paid.solo + funnel.paid.aviso + funnel.paid.suspension] : []
  const funnelOption = {
    grid: grid(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: categoryAxis(stages),
    yAxis: valueAxis(undefined, { minInterval: 1 }),
    series: [bar(t("funnel.series"), stageValues.map((v, i) => ({ value: v, itemStyle: { color: ORDINAL[i + 1] } })), ORDINAL[2], { label: { show: true, position: "top", color: INK.secondary } })],
  }

  // ── Clients ──
  const growthOption = {
    grid: grid({ top: 36 }),
    legend: legend(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => String(Math.abs(v)) },
    xAxis: categoryAxis(labels),
    yAxis: valueAxis((n) => String(Math.abs(n)), { minInterval: 1 }),
    series: [
      bar(t("clients.new"), rows.map((r) => r.newServices), SERIES[0], { stack: "moves" }),
      bar(t("clients.cancelled"), rows.map((r) => -r.cancelled), SERIES[1], { stack: "moves", itemStyle: { borderRadius: [0, 0, 4, 4] } }),
    ],
  }
  const activeOption = {
    grid: grid({ top: 12 }),
    tooltip: { trigger: "axis" },
    xAxis: categoryAxis(labels, { boundaryGap: false }),
    yAxis: valueAxis(undefined, { minInterval: 1, scale: true, splitNumber: 2 }),
    series: [line(t("clients.active"), rows.map((r) => r.activeClients), SERIES[0], { areaStyle: { color: SERIES[0], opacity: 0.1 } })],
  }
  const reasonRows = [...reasons].reverse()
  const reasonsOption = {
    grid: grid({ left: 4, right: 24 }),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: valueAxis(undefined, { minInterval: 1 }),
    yAxis: categoryAxis(reasonRows.map((r) => t(`reasons.${r.reason || "none"}`))),
    series: [bar(t("clients.reasons"), reasonRows.map((r) => r.n), SERIES[0], { barMaxWidth: 14, itemStyle: { borderRadius: [0, 4, 4, 0] } })],
  }
  const mixTotal = mix.plans.reduce((a, p) => a + p.n, 0)
  // At most four segments (the validated slots): from a fifth plan on, the smallest go together as "Otros".
  const mixParts = mix.plans.length > 4 ? [...mix.plans.slice(0, 3), { plan: t("clients.others"), n: mix.plans.slice(3).reduce((a, p) => a + p.n, 0) }] : mix.plans
  const mixOption = {
    grid: grid({ top: 36, bottom: 8 }),
    legend: legend(),
    tooltip: { trigger: "item", formatter: (p: { seriesName: string; value: number }) => `${p.seriesName}: ${p.value} (${mixTotal ? Math.round((p.value / mixTotal) * 100) : 0} %)` },
    xAxis: valueAxis(undefined, { show: false, max: mixTotal || 1 }),
    yAxis: categoryAxis([""], { show: false }),
    series: mixParts.map((p, i) => ({
      type: "bar",
      name: p.plan,
      stack: "mix",
      data: [p.n],
      color: SERIES[i],
      barWidth: 36,
      itemStyle: { borderColor: INK.surface, borderWidth: 2, borderRadius: mixParts.length === 1 ? 6 : i === 0 ? [6, 0, 0, 6] : i === mixParts.length - 1 ? [0, 6, 6, 0] : 0 },
      label: { show: mixTotal > 0 && p.n / mixTotal >= 0.12, formatter: `${p.plan} · ${Math.round((p.n / (mixTotal || 1)) * 100)} %`, color: "#ffffff" },
    })),
  }

  // ── Network ──
  const capRows = network ? [...network.sites].filter((s) => s.use !== null).sort((a, b) => (a.use ?? 0) - (b.use ?? 0)) : []
  const capMax = Math.max(100, ...capRows.map((s) => Math.ceil(((s.use ?? 0) * 100) / 25) * 25))
  const capOption = {
    grid: grid({ left: 4, right: 40 }),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v: number) => `${v} %` },
    xAxis: valueAxis((n) => `${n} %`, { max: capMax, interval: capMax > 150 ? 50 : 25 }),
    yAxis: categoryAxis(capRows.map((s) => s.name), { axisLabel: { color: INK.secondary, width: 130, overflow: "truncate" } }),
    series: [
      bar(
        t("network.use"),
        capRows.map((s) => {
          const v = Math.round((s.use ?? 0) * 100)
          return { value: v, itemStyle: { color: v >= FULL_SHARE * 100 ? STATUS.critical : SERIES[0], borderRadius: [0, 4, 4, 0] } }
        }),
        SERIES[0],
        { barMaxWidth: 14, itemStyle: {}, markLine: { symbol: "none", silent: true, label: { formatter: `${FULL_SHARE * 100} %`, color: INK.muted }, lineStyle: { color: STATUS.critical, type: "solid", width: 1 }, data: [{ xAxis: FULL_SHARE * 100 }] } }
      ),
    ],
  }
  const heatData = network ? network.heat.flatMap((row, di) => row.map((v, h) => [h, di, v ?? "-"])) : []
  const heatMax = network ? Math.max(1, ...network.heat.flat().filter((v): v is number => v !== null)) : 1
  const heatOption = {
    grid: grid({ top: 8, bottom: 52 }),
    tooltip: { position: "top", formatter: (p: { value: [number, number, number | string] }) => `${DAYS[p.value[1]]} ${p.value[0]}:00 · ${typeof p.value[2] === "number" ? `${p.value[2]} Mbps` : t("network.noData")}` },
    xAxis: categoryAxis(Array.from({ length: 24 }, (_, h) => `${h}`), { splitArea: { show: false }, axisLine: { show: false } }),
    yAxis: categoryAxis(DAYS, { inverse: true, axisLine: { show: false } }),
    visualMap: { min: 0, max: heatMax, calculable: false, orient: "horizontal", left: "center", bottom: 0, itemWidth: 10, itemHeight: 140, text: [t("network.more"), t("network.less")], inRange: { color: [...SEQUENTIAL] }, textStyle: { color: INK.muted }, formatter: (v: number) => `${Math.round(v)} Mbps` },
    series: [{ type: "heatmap", name: t("network.heat"), data: heatData, itemStyle: { borderColor: INK.surface, borderWidth: 2, borderRadius: 3 }, emphasis: { itemStyle: { borderColor: INK.primary } } }],
  }
  const zoneColor = { baja: STATUS.critical, justo: STATUS.warning, bien: STATUS.good, satura: STATUS.serious } as const
  const lightOption = {
    grid: grid(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: { name: string; value: number; dataIndex: number }[]) => `${ps[0].name} dBm · ${ps[0].value} ONT<br/>${t(`zones.${light.bins[ps[0].dataIndex]?.zone ?? "bien"}`)}` },
    xAxis: categoryAxis(light.bins.map((b) => String(b.dbm))),
    yAxis: valueAxis(undefined, { minInterval: 1 }),
    series: [bar(t("network.light"), light.bins.map((b) => ({ value: b.n, itemStyle: { color: zoneColor[b.zone] } })), STATUS.good, { barCategoryGap: "12%" })],
  }

  // ── Operations ──
  const ageOption = {
    grid: grid(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: categoryAxis(AGE_BUCKETS.map((b) => t(`ops.ages.${b}`))),
    yAxis: valueAxis(undefined, { minInterval: 1 }),
    series: [bar(t("ops.open"), AGE_BUCKETS.map((b, i) => ({ value: ages[b], itemStyle: { color: ORDINAL[i + 1] } })), ORDINAL[3], { label: { show: true, position: "top", color: INK.secondary } })],
  }
  const repairOption = {
    grid: grid({ top: 12 }),
    tooltip: { trigger: "axis", valueFormatter: (v: number | null) => (v === null || v === undefined ? "—" : `${Math.round(v)} h`) },
    xAxis: categoryAxis(labels, { boundaryGap: false }),
    yAxis: valueAxis((n) => `${n} h`),
    series: [line(t("ops.repair"), rows.map((r) => (r.avgHours === null ? null : Math.round(r.avgHours))), SERIES[0], { connectNulls: false, showSymbol: true, symbolSize: 6 })],
  }
  const backlogOption = {
    grid: grid(),
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: categoryAxis(backlog.days.map((x) => new Date(`${x.day}T12:00:00`).toLocaleDateString("es-MX", { weekday: "short", day: "numeric" }))),
    yAxis: valueAxis(undefined, { minInterval: 1 }),
    series: [bar(t("ops.installs"), backlog.days.map((x) => x.n), SERIES[0])],
  }

  const openReports = AGE_BUCKETS.reduce((a, b) => a + ages[b], 0)
  const backlogTotal = backlog.days.reduce((a, x) => a + x.n, 0)
  const net7 = network ? (network.openOutages ? t("kpi.outagesOpen", { n: network.openOutages }) : t("kpi.outagesHint")) : t("kpi.noNetwork")
  const worstSite = capRows.at(-1)

  return (
    <div className="mt-6 grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-zinc-300">{t("lead")}</p>
        <div role="group" aria-label={t("period")} className="flex gap-1 rounded-full border border-white/10 p-1">
          {PERIODS.map((p) => (
            <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className={`min-h-9 rounded-full px-3 text-xs ${period === p ? "bg-white text-zinc-950" : "text-zinc-300 hover:bg-white/5"}`}>
              {t("months", { n: p })}
            </button>
          ))}
        </div>
      </div>

      <section aria-label={t("kpi.title")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={t("kpi.active")} value={String(now.activeClients)} hint={t("kpi.vsLast", { d: now.activeClients - prev.activeClients >= 0 ? `+${now.activeClients - prev.activeClients}` : String(now.activeClients - prev.activeClients) })} trend={year.map((r) => r.activeClients)} />
        <Tile label={t("kpi.collected")} value={mxn(now.collected)} hint={t("kpi.ofBilled", { billed: mxn(now.expected), pct: now.rate === null ? "—" : `${Math.round(now.rate * 100)} %` })} trend={year.map((r) => r.collected)} color={SERIES[1]} />
        <Tile label={t("kpi.churn")} value={pct(churnYear.at(-1) ?? null)} hint={t("kpi.churnHint", { avg: pct(fc.churn) })} trend={churnYear.map((x) => (x === null ? null : Math.round(x * 1000) / 10))} color={SERIES[2]} />
        <Tile label={t("kpi.outages")} value={network ? String(network.outages7) : "—"} hint={net7} trend={[]} color={SERIES[3]} tone={network && network.openOutages ? "text-red-300" : ""} />
      </section>

      <section aria-labelledby="tb-money" className="grid gap-3">
        <h2 id="tb-money" className="text-lg font-light text-foreground">
          {t("money.title")}
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={t("money.billedVsCollected")} takeaway={t("money.takeaway", { rate: now.rate === null ? "—" : `${Math.round(now.rate * 100)} %` })} tableLabel={tl} table={{ head: [t("cols.month"), t("money.billed"), t("money.collected")], rows: rows.map((r) => [short(r.month), mxn(r.expected), mxn(r.collected)]) }}>
            <EChart option={moneyOption} height={260} label={t("money.billedVsCollected")} />
          </Panel>
          <Panel title={t("forecast.title")} takeaway={t("forecast.takeaway", { low: mxn(fc.rows[0].withChurn), high: mxn(fc.rows[0].scheduled), churn: pct(fc.churn) })} tableLabel={tl} table={{ head: [t("cols.month"), t("forecast.low"), t("forecast.high")], rows: fc.rows.map((r) => [short(r.month), mxn(r.withChurn), mxn(r.scheduled)]) }}>
            <EChart option={forecastOption} height={260} label={t("forecast.title")} />
            <p className="text-[0.7rem] text-amber-200/80">{t("forecast.estimate")}</p>
          </Panel>
          <Panel title={t("money.profitTitle")} takeaway={profitSorted.length ? t("money.profitTakeaway", { worst: profitSorted[0].name, amount: mxn(profitSorted[0].profit) }) : undefined} empty={profitSorted.length ? null : t("empty.sites")} tableLabel={tl} table={{ head: [t("cols.site"), t("money.income"), t("money.costs"), t("money.profit")], rows: profitSorted.map((s) => [s.name, mxn(s.income), mxn(s.building + s.links), mxn(s.profit)]) }}>
            <EChart option={profitOption} height={Math.max(160, profitSorted.length * 34 + 40)} label={t("money.profitTitle")} />
          </Panel>
          <Panel title={t("funnel.title", { month: funnelMonthNow ? short(funnelMonthNow) : "" })} takeaway={funnel && funnel.late > 0 ? (funnel.medianDays === null ? t("funnel.takeawayNoPaid", { owing: funnel.owing }) : t("funnel.takeaway", { owing: funnel.owing, median: funnel.medianDays })) : undefined} empty={funnel && funnel.late === 0 ? t("empty.funnel") : !funnel ? t("loading") : null} tableLabel={tl} table={{ head: [t("cols.stage"), t("cols.clients")], rows: stages.map((s, i) => [s, stageValues[i]]) }}>
            <EChart option={funnelOption} height={240} label={t("funnel.title", { month: short(funnelMonthNow) })} />
          </Panel>
        </div>
      </section>

      <section aria-labelledby="tb-clients" className="grid gap-3">
        <h2 id="tb-clients" className="text-lg font-light text-foreground">
          {t("clients.title")}
        </h2>
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={t("clients.growth")} takeaway={t("clients.growthTakeaway", { n: rows.reduce((a, r) => a + r.newServices, 0), c: rows.reduce((a, r) => a + r.cancelled, 0), months: period })} tableLabel={tl} table={{ head: [t("cols.month"), t("clients.new"), t("clients.cancelled"), t("clients.active")], rows: rows.map((r) => [short(r.month), r.newServices, r.cancelled, r.activeClients]) }}>
            <EChart option={growthOption} height={220} label={t("clients.growth")} />
            <p className="text-xs text-zinc-400">{t("clients.active")}</p>
            <EChart option={activeOption} height={120} label={t("clients.active")} />
          </Panel>
          <div className="grid content-start gap-3">
            <Panel title={t("clients.mix")} takeaway={t("clients.mixTakeaway", { n: mixTotal, tv: mix.tv })} empty={mixTotal ? null : t("empty.clients")} tableLabel={tl} table={{ head: [t("cols.plan"), t("cols.clients")], rows: [...mix.plans.map((p) => [p.plan, p.n] as (string | number)[]), [t("clients.tv"), mix.tv]] }}>
              <EChart option={mixOption} height={96} label={t("clients.mix")} />
            </Panel>
            <Panel title={t("clients.reasons")} takeaway={reasons.length ? t("clients.reasonsTakeaway", { top: t(`reasons.${reasons[0].reason || "none"}`) }) : undefined} empty={reasons.length ? null : t("empty.reasons")} tableLabel={tl} table={{ head: [t("cols.reason"), t("cols.clients")], rows: reasons.map((r) => [t(`reasons.${r.reason || "none"}`), r.n]) }}>
              <EChart option={reasonsOption} height={Math.max(140, reasons.length * 30 + 40)} label={t("clients.reasons")} />
            </Panel>
          </div>
        </div>
      </section>

      <section aria-labelledby="tb-network" className="grid gap-3">
        <h2 id="tb-network" className="text-lg font-light text-foreground">
          {t("network.title")}
        </h2>
        {net === "error" && <p className="text-xs text-amber-200">{t("network.offline")}</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={t("network.capacity")} takeaway={worstSite ? t("network.capacityTakeaway", { site: worstSite.name, use: Math.round((worstSite.use ?? 0) * 100) }) : undefined} empty={capRows.length ? null : t("empty.capacity")} tableLabel={tl} table={{ head: [t("cols.site"), t("network.use"), t("network.busy"), t("network.speed")], rows: capRows.map((s) => [s.name, `${Math.round((s.use ?? 0) * 100)} %`, s.busyDown === null ? "—" : `${s.busyDown} Mbps`, s.speedDown === null ? "—" : `${s.speedDown} Mbps`]) }}>
            <EChart option={capOption} height={Math.max(140, capRows.length * 34 + 40)} label={t("network.capacity")} />
          </Panel>
          <Panel title={t("network.heat")} takeaway={network?.hasTraffic ? t("network.heatTakeaway") : undefined} empty={network?.hasTraffic ? null : t("empty.traffic")} tableLabel={tl} table={network ? { head: [t("cols.day"), ...Array.from({ length: 24 }, (_, h) => `${h}h`)], rows: network.heat.map((r, i) => [DAYS[i], ...r.map((v) => (v === null ? "—" : v))]) } : undefined}>
            <EChart option={heatOption} height={260} label={t("network.heat")} />
          </Panel>
          <Panel title={t("network.light")} takeaway={light.readings ? t("network.lightTakeaway", { n: light.readings, low: light.low, high: light.high }) : undefined} empty={light.readings ? null : t("empty.light")} tableLabel={tl} table={{ head: ["dBm", "ONT"], rows: light.bins.filter((b) => b.n).map((b) => [b.dbm, b.n]) }}>
            <EChart option={lightOption} height={220} label={t("network.light")} />
            <p className="flex flex-wrap gap-3 text-[0.7rem] text-zinc-400">
              {(["baja", "justo", "bien", "satura"] as const).map((z) => (
                <span key={z} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2.5 rounded-sm" style={{ background: zoneColor[z] }} />
                  {t(`zones.${z}`)}
                </span>
              ))}
            </p>
          </Panel>
          <Panel title={t("map.title")} takeaway={mapRows.some((s) => s.lat !== null) ? t("map.takeaway", { n: mapRows.filter((s) => s.lat !== null).length }) : undefined} empty={!mapRows.length ? t("empty.sites") : !mapRows.some((s) => s.lat !== null) ? t("empty.map") : null} tableLabel={tl} table={{ head: [t("cols.site"), t("cols.clients"), t("map.late"), t("map.suspended")], rows: mapRows.map((s) => [s.name, s.clients, s.late, s.suspended]) }}>
            <ClientsMap sites={mapRows} label={t("map.title")} line={(s) => t("map.line", { n: s.clients, late: s.late })} />
          </Panel>
        </div>
      </section>

      <section aria-labelledby="tb-ops" className="grid gap-3">
        <h2 id="tb-ops" className="text-lg font-light text-foreground">
          {t("ops.title")}
        </h2>
        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title={t("ops.open")} takeaway={t("ops.openTakeaway", { n: openReports, old: ages.more })} tableLabel={tl} table={{ head: [t("cols.age"), t("cols.reports")], rows: AGE_BUCKETS.map((b) => [t(`ops.ages.${b}`), ages[b]]) }}>
            <EChart option={ageOption} height={220} label={t("ops.open")} />
          </Panel>
          <Panel title={t("ops.repair")} takeaway={now.avgHours === null ? t("ops.repairNone") : t("ops.repairTakeaway", { h: Math.round(now.avgHours) })} empty={rows.some((r) => r.avgHours !== null) ? null : t("empty.repair")} tableLabel={tl} table={{ head: [t("cols.month"), t("ops.repair")], rows: rows.map((r) => [short(r.month), r.avgHours === null ? "—" : `${Math.round(r.avgHours)} h`]) }}>
            <EChart option={repairOption} height={220} label={t("ops.repair")} />
          </Panel>
          <Panel title={t("ops.installs")} takeaway={t("ops.installsTakeaway", { n: backlogTotal, overdue: backlog.overdue })} tableLabel={tl} table={{ head: [t("cols.day"), t("ops.installs")], rows: backlog.days.map((x) => [x.day, x.n]) }}>
            <EChart option={backlogOption} height={220} label={t("ops.installs")} />
          </Panel>
        </div>
      </section>
    </div>
  )
}
