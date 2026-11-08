"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { Activity, RotateCcw, Unplug } from "lucide-react"
import { cn } from "cn"
import { SimTag } from "@/components/hud/SimTag"
import { createMockLinkTelemetry } from "@/lib/telemetry/mock"
import type { LinkSnapshot } from "@/lib/telemetry/types"
import { useReducedMotion } from "@/lib/motion"
import { numberLocale } from "@/lib/format"

const WINDOW = 60
const FLOORS = 4
const PRIMARY = "M160 58 C 260 14, 340 14, 440 58"
const BACKUP = "M160 92 C 260 136, 340 136, 440 92"

type EventKey = "start" | "cut" | "backup" | "restored" | "back"
type LogEntry = { id: number; t: number; key: EventKey }

/**
 * /empresas "NOC" panel (owner, 2026-11-08): what an Internet dedicado link
 * looks like from the monitoring side. Everything here is simulated
 * (lib/telemetry/mock `createMockLinkTelemetry`, SIMULACIÓN tag, hard rule #2):
 * two routes into an example building, link traffic against the contracted
 * capacity, traffic per floor, latency, an event log, and a "cut the primary
 * link" button that shows the backup route taking the traffic. No switchover
 * time is claimed (it depends on each link's design; the note says so).
 *
 * Live only while on screen and the tab is visible; under reduced motion /
 * paused animations it shows one static frame (history backfill) and only
 * updates when the visitor uses the button.
 */
export default function NocPanel() {
  const t = useTranslations("business.noc")
  const locale = numberLocale(useLocale())
  const reduced = useReducedMotion()
  const [source] = useState(() => createMockLinkTelemetry())
  const [samples, setSamples] = useState<LinkSnapshot[]>(() => source.history(WINDOW))
  const [log, setLog] = useState<LogEntry[]>(() => [{ id: 0, t: Date.now(), key: "start" }])
  const [active, setActive] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const prev = useRef<LinkSnapshot | null>(null)
  const nextId = useRef(1)
  const timer = useRef<number | null>(null)
  const fmt = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }), [locale])
  const num = useMemo(() => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), [locale])

  const ingest = useCallback((s: LinkSnapshot) => {
    const p = prev.current
    const events: EventKey[] = []
    if (p) {
      if (p.primaryUp && !s.primaryUp) events.push("cut")
      if (p.activePath !== "backup" && s.activePath === "backup") events.push("backup")
      if (!p.primaryUp && s.primaryUp) events.push("restored", "back")
    }
    prev.current = s
    setSamples((xs) => [...xs.slice(-(WINDOW - 1)), s])
    if (events.length) {
      setLog((xs) => [...events.map((key) => ({ id: nextId.current++, t: s.t, key })).reverse(), ...xs].slice(0, 6))
    }
  }, [])

  // On screen and tab visible → live.
  useEffect(() => {
    const el = root.current
    if (!el) return
    let onScreen = false
    const update = () => setActive(onScreen && !document.hidden)
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.isIntersecting
      update()
    })
    io.observe(el)
    document.addEventListener("visibilitychange", update)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", update)
    }
  }, [])

  useEffect(() => {
    if (!active || reduced) return
    return source.subscribe(ingest)
  }, [active, reduced, source, ingest])

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const cutOrRestore = () => {
    const cut = samples[samples.length - 1]?.primaryUp ?? true
    if (cut) source.cutPrimary()
    else source.restorePrimary()
    // Live mode gets the change from the subscription; the static frame
    // (reduced motion, offscreen) pulls it, and again once the cut is detected.
    if (reduced || !active) {
      ingest(source.now())
      if (cut) {
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => ingest(source.now()), 1600)
      }
    }
  }

  const last = samples[samples.length - 1]
  const status = !last.primaryUp ? (last.activePath === "backup" ? "backup" : "detect") : "primary"
  const contracted = last.contractedGbps
  const floorMax = Math.max(1, ...samples.slice(-10).flatMap((s) => s.floorsGbps)) * 1.15

  return (
    <div ref={root} className="biz-frame overflow-hidden">
      {/* Header: what this is, the SIMULACIÓN tag, the link state. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--biz-line)] px-5 py-4 sm:px-7">
        <p className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
          <Activity className="size-4 text-[var(--biz-accent)]" aria-hidden />
          {t("example", { gbps: contracted })}
          <SimTag />
        </p>
        <p
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs",
            status === "primary" && "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
            status === "detect" && "border-red-400/40 bg-red-400/10 text-red-200",
            status === "backup" && "border-amber-400/40 bg-amber-400/10 text-amber-200"
          )}
        >
          <span aria-hidden className={cn("size-1.5 rounded-full", status === "primary" ? "bg-emerald-400" : status === "detect" ? "bg-red-400" : "bg-amber-400")} />
          {t(`status.${status}`)}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr]">
        {/* Topology + traffic. */}
        <div className="border-[var(--biz-line)] p-5 sm:p-7 lg:border-r">
          <Topology status={status} live={active && !reduced} labels={{ network: t("network"), building: t("building"), primary: t("primary"), backup: t("backup") }} />

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <dl className="flex gap-8">
              {(["down", "up"] as const).map((k) => (
                <div key={k}>
                  <dt className="text-xs text-zinc-400">{t(k)}</dt>
                  <dd className="mt-1 font-mono text-3xl text-white tabular-nums">
                    {num.format(k === "down" ? last.downGbps : last.upGbps)}
                    <span className="ml-1.5 text-sm text-zinc-400">Gbps</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="text-xs text-zinc-400">{t("contracted", { gbps: contracted })}</p>
          </div>
          <Graph samples={samples} contracted={contracted} label={t("graphLabel")} />
        </div>

        {/* Floors, latency, events, the button. */}
        <div className="flex flex-col gap-6 border-t border-[var(--biz-line)] p-5 sm:p-7 lg:border-t-0">
          <div>
            <h3 className="text-xs text-zinc-400">{t("floors")}</h3>
            <ul className="mt-3 grid gap-2.5">
              {Array.from({ length: FLOORS }, (_, i) => FLOORS - 1 - i).map((i) => (
                <li key={i} className="grid grid-cols-[2rem_1fr_4.5rem] items-center gap-3">
                  <span className="font-mono text-xs text-zinc-400">{t("floor", { n: i + 1 })}</span>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <span
                      className="block h-full origin-left rounded-full bg-gradient-to-r from-[var(--biz-accent)] to-white transition-transform duration-500"
                      style={{ transform: `scaleX(${Math.min(1, last.floorsGbps[i] / floorMax)})` }}
                    />
                  </span>
                  <span className="text-right font-mono text-xs text-zinc-200 tabular-nums">{num.format(last.floorsGbps[i])} Gbps</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-baseline justify-between border-t border-[var(--biz-line)] pt-5">
            <span className="text-xs text-zinc-400">{t("latency")}</span>
            <span className="font-mono text-xl text-white tabular-nums">
              {num.format(last.latencyMs)} <span className="text-sm text-zinc-400">ms</span>
            </span>
          </div>

          <div className="border-t border-[var(--biz-line)] pt-5">
            <h3 className="text-xs text-zinc-400">{t("log")}</h3>
            <ol className="mt-3 grid gap-1.5 font-mono text-xs" aria-live="polite" aria-relevant="additions">
              {log.map((e, i) => (
                <li key={e.id} className={cn("flex gap-3", i === 0 ? "text-zinc-100" : "text-zinc-400")}>
                  <time dateTime={new Date(e.t).toISOString()} className="tabular-nums text-zinc-400">{fmt.format(e.t)}</time>
                  <span className={cn(e.key === "cut" && "text-red-300", e.key === "backup" && "text-amber-200", (e.key === "restored" || e.key === "back") && "text-emerald-300")}>
                    {t(`events.${e.key}`)}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <button
            type="button"
            onClick={cutOrRestore}
            disabled={status === "detect"}
            className={cn(
              "mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-[4px] border px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--biz-accent)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60",
              last.primaryUp ? "border-red-400/40 text-red-100 hover:bg-red-400/10" : "border-emerald-400/40 text-emerald-100 hover:bg-emerald-400/10"
            )}
          >
            {last.primaryUp ? <Unplug className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
            {last.primaryUp ? t("cut") : t("restore")}
          </button>
        </div>
      </div>
      <p className="border-t border-[var(--biz-line)] px-5 py-4 text-xs text-zinc-400 sm:px-7">{t("note")}</p>
    </div>
  )
}

/** Two routes from the network to the building; packets run on the active one. */
function Topology({
  status,
  live,
  labels,
}: {
  status: "primary" | "detect" | "backup"
  live: boolean
  labels: { network: string; building: string; primary: string; backup: string }
}) {
  const primaryOk = status === "primary"
  const onBackup = status === "backup"
  return (
    <svg viewBox="0 -16 600 182" className="h-auto w-full" aria-hidden>
      <defs>
        <linearGradient id="noc-lit" x1="0" x2="1">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
      {/* Routes. */}
      <path d={PRIMARY} fill="none" stroke={primaryOk ? "url(#noc-lit)" : "#f87171"} strokeOpacity={primaryOk ? 1 : 0.55} strokeWidth="2" strokeDasharray={primaryOk ? undefined : "6 6"} />
      <path d={BACKUP} fill="none" stroke={onBackup ? "url(#noc-lit)" : "#ffffff"} strokeOpacity={onBackup ? 1 : 0.22} strokeWidth={onBackup ? 2 : 1.2} strokeDasharray={onBackup ? undefined : "4 6"} />
      {!primaryOk && (
        <g transform="translate(300 25)" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round">
          <path d="M-7 -7 L7 7 M7 -7 L-7 7" />
        </g>
      )}
      <text x="300" y="4" textAnchor="middle" className="fill-zinc-400 text-[19px] sm:text-[11px]">{labels.primary}</text>
      <text x="300" y="158" textAnchor="middle" className="fill-zinc-400 text-[19px] sm:text-[11px]">{labels.backup}</text>

      {/* Packets on the active route (none while the cut is being detected). */}
      {live && status !== "detect" &&
        [0, 1, 2].map((k) => (
          <circle key={`${status}${k}`} r="3.2" fill="#fff" style={{ filter: "drop-shadow(0 0 4px #c4b5fd)" }}>
            <animateMotion dur="1.8s" begin={`${k * 0.6}s`} repeatCount="indefinite" path={onBackup ? BACKUP : PRIMARY} />
          </circle>
        ))}

      {/* Endpoints. */}
      {[
        { x: 10, label: labels.network },
        { x: 440, label: labels.building },
      ].map((n) => (
        <g key={n.x}>
          <rect x={n.x} y="45" width="150" height="60" rx="3" fill="#0b0b0e" stroke="#ffffff" strokeOpacity="0.25" />
          <text x={n.x + 75} y="82" textAnchor="middle" className="fill-zinc-100 text-[19px] sm:text-[13px]">{n.label}</text>
        </g>
      ))}
    </svg>
  )
}

/** Mirrored column graph: download up, upload down, the contracted capacity as a dashed limit. */
function Graph({ samples, contracted, label }: { samples: LinkSnapshot[]; contracted: number; label: string }) {
  const W = 600
  const H = 150
  const mid = H / 2
  const amp = mid - 10
  const col = W / WINDOW
  const y = (g: number) => (g / contracted) * amp
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 h-auto w-full" role="img" aria-label={label}>
      <line x1="0" x2={W} y1={mid - amp} y2={mid - amp} stroke="#ffffff" strokeOpacity="0.2" strokeDasharray="3 5" />
      <line x1="0" x2={W} y1={mid + amp} y2={mid + amp} stroke="#ffffff" strokeOpacity="0.2" strokeDasharray="3 5" />
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="#ffffff" strokeOpacity="0.12" />
      {samples.map((s, i) => {
        const x = (WINDOW - samples.length + i) * col
        const age = 0.35 + 0.65 * (i / Math.max(1, samples.length - 1))
        const newest = i === samples.length - 1
        return (
          <g key={s.t} opacity={age}>
            <rect x={x + 1} y={mid - y(s.downGbps)} width={col - 2} height={y(s.downGbps)} fill={newest ? "#ffffff" : "#c4b5fd"} />
            <rect x={x + 1} y={mid} width={col - 2} height={y(s.upGbps)} fill={newest ? "#ffffff" : "#8b5cf6"} />
          </g>
        )
      })}
    </svg>
  )
}
