"use client"

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import dynamic from "next/dynamic"
import { useLocale, useTranslations } from "next-intl"
import { Check, Gamepad2, Laptop, Move, Smartphone, Speaker, Tv } from "lucide-react"
import { cn } from "cn"
import { SimTag } from "@/components/hud/SimTag"
import { Button } from "@/components/ui/button"
import { useReducedMotion } from "@/lib/motion"
import { selection } from "@/lib/selection"
import { track } from "@/lib/analytics"
import { wifi7Plan } from "@/lib/plans"
import { formatNumber, speedLabel } from "@/lib/format"
import {
  APT,
  BANDS,
  DEVICES,
  GENERATIONS,
  MATERIAL_IDS,
  MAX_CHANNEL_MHZ,
  ROOMS,
  ROUTER_START,
  WALLS,
  WALL_THICKNESS_M,
  clampRouter,
  PLAN_MODEM,
  getGeneration,
  lineup,
  burstFill,
  linkFor,
  roomAt,
  type BandId,
  type DeviceId,
  type Generation,
  type MaterialId,
  type Pt,
  type Quality,
} from "@/lib/wifi"
import { DOMAIN } from "@/lib/wifi-sim"
import { SceneBoundary, canUseWebGL } from "./SceneBoundary"

const WifiWaves = dynamic(() => import("./WifiWaves"), { ssr: false })

const DEVICE_ICON: Record<DeviceId, typeof Tv> = { tv: Tv, laptop: Laptop, console: Gamepad2, phone: Smartphone, speaker: Speaker }
const QUALITY_CLASS: Record<Quality, string> = {
  excellent: "text-ok",
  good: "text-fiber",
  fair: "text-warn",
  weak: "text-rose-400",
}
const WALL_STYLE: Record<MaterialId, { stroke: string; dash?: string }> = {
  concrete: { stroke: "rgb(226 232 240 / 0.8)" },
  brick: { stroke: "rgb(203 213 225 / 0.6)" },
  drywall: { stroke: "rgb(203 213 225 / 0.5)", dash: "0.14 0.09" },
}
const STEP_M = 0.25
const MAX_BITS = Math.log2(Math.max(...GENERATIONS.map((g) => g.qam)))

/** Meters → % of the stage (the stage is exactly the simulated domain). */
const pctX = (x: number) => ((x - DOMAIN.x0) / DOMAIN.w) * 100
const pctY = (y: number) => ((y - DOMAIN.y0) / DOMAIN.h) * 100

/**
 * "Así viaja el Wi-Fi por tu depa": a simulated apartment where Wi-Fi waves
 * leave the modem and lose strength through concrete, brick and drywall
 * (WifiWaves, GPU), a blueprint overlay (walls, rooms, devices, links), a
 * draggable modem (pointer, tap-to-place, arrow keys) and a generation
 * switcher (4 → 7) with each standard's figures. Device readouts come from the
 * illustrative link model in lib/wifi.ts. Everything simulated is tagged
 * SIMULACIÓN (hard rule #2); the visible readouts and the live summary are the
 * text equivalent of the canvas (hard rule #9). Lazy (LazyWifiLab).
 */
export default function WifiLab() {
  const t = useTranslations("fiber.wifi")
  const locale = useLocale()
  const reduced = useReducedMotion()
  // The plan's real modem first (what the customer gets); the standards compare.
  const [genId, setGenId] = useState<Generation["id"]>(wifi7Plan ? "modem" : "wifi7")
  const [router, setRouter] = useState<Pt>(ROUTER_START)
  // Client-only component (next/dynamic, ssr: false), so this runs in the browser.
  const [webgl, setWebgl] = useState(() => canUseWebGL())
  const [ready, setReady] = useState(false)
  const [announce, setAnnounce] = useState("")
  const stage = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const gen = getGeneration(genId)
  // Standards on the switcher; the plan's modem has its own option below.
  const standards = lineup(!!wifi7Plan).filter((g) => g.kind === "standard")
  const shownBands = [...new Set(lineup(!!wifi7Plan).flatMap((g) => g.bands))]
  const planSpeed = wifi7Plan ? speedLabel(wifi7Plan.downMbps) : ""
  const nameOf = (g: Generation) => (g.kind === "modem" ? t("modem.name", { speed: planSpeed }) : g.name)
  const active = useMemo(
    () => ({ b24: gen.bands.includes("b24"), b5: gen.bands.includes("b5"), b6: gen.bands.includes("b6") }) as Record<BandId, boolean>,
    [gen]
  )
  const fill = useMemo(() => burstFill(gen, lineup(!!wifi7Plan)), [gen])
  const links = useMemo(() => DEVICES.map((d) => ({ ...d, link: linkFor(gen, router, d.at) })), [gen, router])

  // Link dashes and the modem ping only animate while the lab is on screen.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => el.toggleAttribute("data-inview", e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const bandList = (bands: BandId[]) => bands.map((b) => BANDS[b].label).join(" + ")
  const summarize = (r: Pt, g: Generation) =>
    [
      t("routerIn", { room: t(`rooms.${roomAt(r)}`) }),
      ...DEVICES.map((d) => {
        const l = linkFor(g, r, d.at)
        return t("deviceStatus", {
          device: t(`devices.${d.id}`),
          quality: t(`quality.${l.quality}`).toLowerCase(),
          bands: bandList(l.bands) + (g.mlo && l.bands.length > 1 ? ` ${t("mlo")}` : ""),
        })
      }),
    ].join(" ")

  const toMeters = (e: { clientX: number; clientY: number }) => {
    const r = stage.current!.getBoundingClientRect()
    return clampRouter({
      x: DOMAIN.x0 + ((e.clientX - r.left) / r.width) * DOMAIN.w,
      y: DOMAIN.y0 + ((e.clientY - r.top) / r.height) * DOMAIN.h,
    })
  }
  const place = (p: Pt) => {
    setRouter(p)
    setAnnounce(summarize(p, gen))
  }
  const onKey = (e: KeyboardEvent) => {
    const d = (e.shiftKey ? 4 : 1) * STEP_M
    const delta = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[e.key]
    if (!delta) return
    e.preventDefault()
    place(clampRouter({ x: router.x + delta[0], y: router.y + delta[1] }))
  }
  const pickGen = (id: Generation["id"]) => {
    setGenId(id)
    setAnnounce(summarize(router, getGeneration(id)))
  }

  const fmt = (n: number) => formatNumber(n, locale)
  const maxText = gen.maxGbps < 1 ? { v: fmt(gen.maxGbps * 1000), u: "Mbps" } : { v: fmt(gen.maxGbps), u: "Gbps" }
  const bits = Math.log2(gen.qam)

  return (
    <div ref={root} className="wifi-lab grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      {/* ── Stage ─────────────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div
          ref={stage}
          className="relative isolate w-full touch-pan-y overflow-hidden rounded-2xl border border-white/10 bg-[#03060f] shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9),0_0_80px_-30px_rgb(6_182_212/0.35)]"
          style={{ aspectRatio: `${DOMAIN.w} / ${DOMAIN.h}` }}
          // Tap / click on the plan places the modem (click, not pointerdown, so
          // a finger scrolling the page over the plan never moves it).
          onClick={(e) => {
            if (e.target === e.currentTarget || (e.target as Element).closest("svg")) place(toMeters(e))
          }}
        >
          {/* Fallback light while the simulation loads or without WebGL. */}
          <div
            aria-hidden
            className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-0" : "opacity-100")}
            style={{
              background: `radial-gradient(circle at ${pctX(router.x)}% ${pctY(router.y)}%, rgb(34 211 238 / 0.28), rgb(167 139 250 / 0.08) 22%, transparent 45%)`,
            }}
          />
          {webgl && (
            <div aria-hidden className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
              <SceneBoundary onError={() => setWebgl(false)}>
                <WifiWaves
                  active={active}
                  fill={fill}
                  router={router}
                  still={reduced}
                  onReady={() => setReady(true)}
                  onError={() => setWebgl(false)}
                />
              </SceneBoundary>
            </div>
          )}

          {/* Blueprint overlay: the accessible picture of the plan. */}
          <svg
            role="img"
            aria-label={t("planAlt")}
            viewBox={`${DOMAIN.x0} ${DOMAIN.y0} ${DOMAIN.w} ${DOMAIN.h}`}
            className="absolute inset-0 h-full w-full cursor-crosshair"
          >
            <defs>
              <filter id="wl-glow" x="-10%" y="-10%" width="120%" height="120%">
                <feGaussianBlur stdDeviation="0.07" />
              </filter>
              <pattern id="wl-grid" width="0.5" height="0.5" patternUnits="userSpaceOnUse">
                <path d="M0.5 0H0V0.5" fill="none" stroke="rgb(148 163 184 / 0.07)" strokeWidth="0.012" />
              </pattern>
            </defs>
            <rect x={0} y={0} width={APT.w} height={APT.h} fill="url(#wl-grid)" />

            {/* Ruler along the bottom edge (meters) */}
            <g className="fill-slate-400/60 font-mono max-sm:hidden" fontSize="0.15">
              {Array.from({ length: APT.w + 1 }, (_, i) => (
                <g key={`x${i}`}>
                  <line x1={i} x2={i} y1={APT.h + 0.08} y2={APT.h + 0.2} stroke="rgb(148 163 184 / 0.4)" strokeWidth="0.012" />
                  {i % 2 === 0 && (
                    <text x={i} y={APT.h + 0.4} textAnchor="middle">
                      {i === APT.w ? `${i} m` : i}
                    </text>
                  )}
                </g>
              ))}
            </g>

            {/* Room names */}
            <g className="fill-slate-300/55 font-mono uppercase max-sm:[font-size:0.3px]" fontSize="0.17" letterSpacing="0.03">
              {ROOMS.map((r) => (
                <text key={r.id} x={r.x + 0.24} y={r.y + 0.42}>
                  {t(`rooms.${r.id}`)}
                </text>
              ))}
            </g>

            {/* Links modem → devices, one line per band in use */}
            <g>
              {links.map(({ id, at, link }) => {
                const dx = at.x - router.x
                const dy = at.y - router.y
                const len = Math.hypot(dx, dy) || 1
                const nx = -dy / len
                const ny = dx / len
                return link.bands.map((b, i) => {
                  const off = (i - (link.bands.length - 1) / 2) * 0.075
                  return (
                    <line
                      key={`${id}-${b}`}
                      className="wifi-link"
                      x1={router.x + nx * off}
                      y1={router.y + ny * off}
                      x2={at.x + nx * off}
                      y2={at.y + ny * off}
                      stroke={BANDS[b].color}
                      strokeWidth="0.028"
                      strokeDasharray="0.16 0.2"
                      strokeLinecap="round"
                      opacity={link.quality === "weak" ? 0.3 : 0.85}
                    />
                  )
                })
              })}
            </g>

            {/* Walls: glow + core, styled by material */}
            <g filter="url(#wl-glow)" opacity="0.28">
              {WALLS.map((w, i) => (
                <line key={`g${i}`} x1={w.a.x} y1={w.a.y} x2={w.b.x} y2={w.b.y} stroke="#67e8f9" strokeWidth={WALL_THICKNESS_M[w.m] * 1.3} />
              ))}
            </g>
            <g>
              {WALLS.map((w, i) => (
                <line
                  key={`w${i}`}
                  x1={w.a.x}
                  y1={w.a.y}
                  x2={w.b.x}
                  y2={w.b.y}
                  stroke={WALL_STYLE[w.m].stroke}
                  strokeDasharray={WALL_STYLE[w.m].dash}
                  strokeWidth={WALL_THICKNESS_M[w.m]}
                  strokeLinecap="square"
                />
              ))}
            </g>

            {/* Devices */}
            <g>
              {links.map(({ id, at, link }) => (
                <g key={id}>
                  <circle cx={at.x} cy={at.y} r="0.26" fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth="0.015" />
                  <circle cx={at.x} cy={at.y} r="0.11" className={cn("fill-current", QUALITY_CLASS[link.quality])} />
                  <text x={at.x} y={at.y + 0.5} textAnchor="middle" fontSize="0.17" className="fill-white/80 font-sans max-sm:[font-size:0.3px]">
                    {t(`devices.${id}`)}
                  </text>
                </g>
              ))}
            </g>
          </svg>

          {/* The modem: a real button (focus, keyboard), dragged with pointer capture. */}
          <button
            type="button"
            aria-label={t("routerAria")}
            className="group absolute z-10 grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none place-items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
            style={{ left: `${pctX(router.x)}%`, top: `${pctY(router.y)}%` }}
            onKeyDown={onKey}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              dragging.current = true
            }}
            onPointerMove={(e) => {
              if (dragging.current) setRouter(toMeters(e))
            }}
            onPointerUp={(e) => {
              if (!dragging.current) return
              dragging.current = false
              place(toMeters(e))
            }}
            onPointerCancel={() => {
              dragging.current = false
            }}
          >
            <span aria-hidden className="wifi-router-ping absolute inset-1 rounded-full border border-cyan-200/70" />
            <span aria-hidden className="wifi-router-ping absolute inset-1 rounded-full border border-cyan-200/50 [animation-delay:-1.1s]" />
            <span
              aria-hidden
              className="relative size-4 rounded-full bg-white shadow-[0_0_0_3px_rgb(6_182_212/0.55),0_0_22px_6px_rgb(34_211_238/0.8)] transition-transform group-hover:scale-110"
            />
          </button>

          {/* HUD */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5 sm:p-3.5">
            <span className="hidden items-center gap-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-slate-300/70 sm:flex">
              <span className="size-1.5 animate-pulse rounded-full bg-fiber shadow-[0_0_8px_var(--color-fiber)]" />
              {t("hud")} · {nameOf(gen)}
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              {shownBands.map((b) => (
                <span
                  key={b}
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 font-mono text-[0.55rem] tracking-wider transition-opacity sm:text-[0.6rem]",
                    active[b] ? "opacity-100" : "opacity-25"
                  )}
                  style={{ borderColor: `${BANDS[b].color}66`, color: BANDS[b].color }}
                >
                  {BANDS[b].label}
                </span>
              ))}
            </span>
          </div>
          {/* Corner marks */}
          {["top-1.5 left-1.5 border-t border-l", "top-1.5 right-1.5 border-t border-r", "bottom-1.5 left-1.5 border-b border-l", "bottom-1.5 right-1.5 border-b border-r"].map((c) => (
            <span key={c} aria-hidden className={cn("pointer-events-none absolute size-3 border-cyan-200/40", c)} />
          ))}
        </div>

        {/* Under the stage: SIMULACIÓN tag + wall legend */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.65rem] text-muted-foreground">
          <SimTag />
          {MATERIAL_IDS.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <svg aria-hidden viewBox="0 0 20 6" className="h-1.5 w-5">
                <line x1="0" y1="3" x2="20" y2="3" stroke={WALL_STYLE[m].stroke} strokeWidth={m === "concrete" ? 4 : m === "brick" ? 3 : 2} strokeDasharray={m === "drywall" ? "3 2" : undefined} />
              </svg>
              {t(`materials.${m}`)}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 20 6" className="h-1.5 w-5">
              <path d="M0 3h3M5 3h2M9 3h11" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {t("burstHint")}
          </span>
          <span className="inline-flex items-center gap-1.5 sm:ml-auto">
            <Move className="size-3" aria-hidden />
            {t("dragHint")}
          </span>
        </div>

        {/* Devices */}
        <h4 className="mt-6 font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">{t("devicesTitle")}</h4>
        <ul className="mt-2.5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/[0.07] sm:grid-cols-3 lg:grid-cols-5">
          {links.map(({ id, link }) => {
            const Icon = DEVICE_ICON[id]
            const best = Math.max(...link.bands.map((b) => link.dbm[b] ?? -120))
            return (
              <li key={id} className="surface-cell flex min-w-0 flex-col gap-2 p-3 sm:p-3.5">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="leading-tight">{t(`devices.${id}`)}</span>
                </span>
                <span className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-sm font-semibold", QUALITY_CLASS[link.quality])}>{t(`quality.${link.quality}`)}</span>
                  <span className="font-mono text-[0.65rem] text-muted-foreground tabular-nums">{Math.round(best)} dBm</span>
                </span>
                {/* Per-band meters (2.4 / 5 GHz) for this generation */}
                <span aria-hidden className="grid grid-cols-2 gap-1">
                  {shownBands.map((b) => {
                    const v = link.dbm[b]
                    const used = link.bands.includes(b)
                    const fill = v === undefined ? 0 : Math.max(0.06, Math.min(1, (v + 90) / 50))
                    return (
                      <span key={b} className="h-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <span
                          className="block h-full rounded-full transition-[width] duration-300"
                          style={{ width: `${fill * 100}%`, background: BANDS[b].color, opacity: used ? 1 : 0.3, boxShadow: used ? `0 0 6px ${BANDS[b].color}` : undefined }}
                        />
                      </span>
                    )
                  })}
                </span>
                <span className="font-mono text-[0.6rem] leading-snug text-muted-foreground">
                  {bandList(link.bands)}
                  {gen.mlo && link.bands.length > 1 && <span className="text-fiber"> {t("mlo")}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        <p aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>

      {/* ── Generation panel ─────────────────────────────────────────── */}
      <div className="surface relative flex min-w-0 flex-col overflow-hidden rounded-2xl p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-56 transition-opacity duration-500"
          style={{
            background: "radial-gradient(70% 100% at 50% 0%, rgb(6 182 212 / 0.16), rgb(167 139 250 / 0.06) 50%, transparent 75%)",
            opacity: gen.mlo ? 1 : 0.35,
          }}
        />
        <fieldset className="relative">
          <legend className="font-mono text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">{t("generation")}</legend>
          <div
            className="mt-2.5 grid gap-1 rounded-xl border border-white/10 bg-black/30 p-1"
            style={{ gridTemplateColumns: `repeat(${standards.length}, minmax(0, 1fr))` }}
          >
            {standards.map((g) => {
              const on = g.id === genId
              return (
                <label
                  key={g.id}
                  className={cn(
                    "relative grid h-12 cursor-pointer place-items-center rounded-lg font-mono text-lg font-semibold transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                    on
                      ? g.mlo
                        ? "bg-gradient-to-b from-cyan-300/25 to-violet-400/20 text-white shadow-[inset_0_0_0_1px_rgb(103_232_249/0.6),0_0_24px_-6px_var(--color-fiber)]"
                        : "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.2)]"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  )}
                >
                  <input type="radio" name="wifi-generation" value={g.id} checked={on} onChange={() => pickGen(g.id)} className="sr-only" />
                  <span className="sr-only">{g.name}</span>
                  <span aria-hidden>{g.short}</span>
                </label>
              )
            })}
          </div>
          {wifi7Plan && (
            <label
              className={cn(
                "mt-1.5 flex h-12 cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 transition-colors has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                genId === "modem"
                  ? "border-cyan-300/60 bg-gradient-to-r from-cyan-300/20 to-violet-400/15 text-white shadow-[0_0_24px_-6px_var(--color-fiber)]"
                  : "border-white/10 bg-black/30 text-muted-foreground hover:bg-white/5 hover:text-foreground"
              )}
            >
              <input type="radio" name="wifi-generation" value="modem" checked={genId === "modem"} onChange={() => pickGen("modem")} className="sr-only" />
              <span className="font-semibold">
                {t("modem.option")}
                <span className="ml-2 font-mono text-sm font-normal text-fiber">{PLAN_MODEM.name}</span>
              </span>
              <span className="font-mono text-[0.65rem] uppercase tracking-wider opacity-80">{t("modem.optionSub", { speed: planSpeed })}</span>
            </label>
          )}
        </fieldset>

        <div className="relative mt-6">
          <p className="font-mono text-xs text-muted-foreground">
            {gen.kind === "modem" ? `${nameOf(gen)} · ${t("modem.spec")}` : `${gen.name} · ${gen.ieee} · ${gen.year}`}
          </p>
          <p className="mt-1 flex items-baseline gap-2 font-mono">
            <span
              key={gen.id}
              className={cn(
                "animate-in fade-in text-6xl font-semibold tracking-[-0.05em] tabular-nums duration-500 sm:text-7xl",
                gen.mlo ? "text-brand" : "text-foreground"
              )}
            >
              {maxText.v}
            </span>
            <span className="text-xl text-muted-foreground">{maxText.u}</span>
          </p>
          <p className="mt-1 text-sm text-foreground/90">{t("transferLabel")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("maxLabel")}</p>
          <p className="mt-1 font-mono text-[0.7rem] text-muted-foreground">
            {t("modem.perBand", {
              b24: `${fmt(gen.bandMaxMbps.b24 ?? 0)} Mbps`,
              b5: `${fmt(gen.bandMaxMbps.b5 ?? 0)} Mbps`,
            })}
          </p>
        </div>

        <dl className="relative mt-6 grid gap-4 text-sm">
          <div>
            <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t("bands")}</dt>
            <dd className="mt-1.5 flex gap-1.5">
              {shownBands.map((b) => (
                <span
                  key={b}
                  className="rounded-md border px-2 py-1 font-mono text-xs"
                  style={{ borderColor: `${BANDS[b].color}55`, color: BANDS[b].color, background: `${BANDS[b].color}14` }}
                >
                  {BANDS[b].label}
                </span>
              ))}
              <span className="self-center pl-1 font-mono text-[0.7rem] text-muted-foreground">{t("modem.streamsPerBand", { n: gen.streams / gen.bands.length })}</span>
            </dd>
          </div>
          <div>
            <dt className="flex justify-between font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {t("channel")}
              <span className="text-foreground normal-case">{gen.maxChannelMhz} MHz</span>
            </dt>
            <dd aria-hidden className="mt-2 grid grid-cols-16 gap-0.5">
              {Array.from({ length: MAX_CHANNEL_MHZ / 20 }, (_, i) => (
                <span
                  key={i}
                  className={cn("h-2 rounded-[2px] transition-colors duration-300", i < gen.maxChannelMhz / 20 ? "bg-fiber shadow-[0_0_6px_var(--color-fiber)]" : "bg-white/[0.07]")}
                />
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t("modulation")}</dt>
            <dd className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="font-mono text-base text-foreground">{gen.qam}-QAM</span>
              <span className="text-xs text-muted-foreground">{t("bits", { n: bits })}</span>
            </dd>
            {/* One cell per bit carried by each symbol (6 → 12). */}
            <dd aria-hidden className="mt-2 grid grid-cols-12 gap-0.5">
              {Array.from({ length: MAX_BITS }, (_, i) => (
                <span
                  key={i}
                  className={cn("h-2 rounded-[2px] transition-colors duration-300", i < bits ? "bg-cyan-100 shadow-[0_0_6px_rgb(165_243_252/0.9)]" : "bg-white/[0.07]")}
                />
              ))}
            </dd>
          </div>
          <div>
            <dt className="flex justify-between font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">
              {t("linksAtOnce")}
              <span className="text-foreground">
                {gen.mlo ? 2 : 1}
                {gen.mlo && <span className="ml-1.5 text-fiber">MLO</span>}
              </span>
            </dt>
            {/* One lane per band a single device can use at the same time. */}
            <dd aria-hidden className="mt-2 grid grid-cols-2 gap-1">
              {shownBands.map((b, i) => {
                const on = gen.mlo || i === shownBands.length - 1
                return (
                  <span
                    key={b}
                    className="h-2 rounded-[2px] transition-all duration-300"
                    style={{ background: on ? BANDS[b].color : "rgb(255 255 255 / 0.07)", boxShadow: on ? `0 0 8px ${BANDS[b].color}` : undefined }}
                  />
                )
              })}
            </dd>
          </div>
          <div>
            <dt className="font-mono text-[0.65rem] uppercase tracking-wider text-muted-foreground">{t("tech")}</dt>
            <dd>
              <ul className="mt-1.5 grid gap-1.5">
                {gen.tech.map((k) => (
                  <li key={k} className="flex gap-2 text-sm leading-snug text-foreground/90">
                    <Check className="mt-0.5 size-4 shrink-0 text-fiber" aria-hidden />
                    {t(`techs.${k}`)}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        {wifi7Plan && (
          <div className="relative mt-auto border-t border-white/[0.06] pt-5 max-lg:mt-6">
            <p className="text-sm text-foreground/90">{t("cta", { speed: speedLabel(wifi7Plan.downMbps) })}</p>
            <Button
              size="lg"
              className="mt-3 w-full"
              onClick={() => {
                track("plan_selected", { planId: wifi7Plan!.id, context: "wifi" })
                selection.openLead(wifi7Plan!.id)
              }}
            >
              {t("ctaButton", { speed: speedLabel(wifi7Plan.downMbps) })}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
