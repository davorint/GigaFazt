"use client"

import { useId, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Cctv, HardDrive, KeyRound, Monitor, MonitorPlay, Phone, Server, Wifi, type LucideIcon } from "lucide-react"
import { cn } from "cn"
import { business, transferSeconds } from "@/lib/business"
import { BRIEF_SPACES, type BriefSpace } from "@/lib/brief"
import { ELEMENT_KINDS, FLOORS, PLAN_H, PLAN_W, SEGMENTS, fiberRun, kindCounts, roomKey, type ElementKind, type FloorElement, type Segment } from "@/lib/floors"
import { QuoteButton } from "./QuoteButton"

const ICONS: Record<ElementKind, LucideIcon> = {
  closet: Server,
  ap: Wifi,
  camera: Cctv,
  access: KeyRound,
  screen: MonitorPlay,
  desk: Monitor,
  phone: Phone,
  storage: HardDrive,
}
const SEG_COLOR: Record<Segment, string> = {
  admin: "#ffffff",
  cameras: "#fb7185",
  guests: "#67e8f9",
  production: "#a78bfa",
}
const CLOSET_ID = "closet"

type Selected = { kind: "element"; id: string } | { kind: "type"; type: ElementKind }

/**
 * Chapter 02 centerpiece (owner, 2026-11-08): an example floor of each space
 * we connect, with every point the fiber network reaches cabled back to the
 * network closet. Pick a space, tap any point (or the list, its text
 * equivalent) to light its run and read what it does; "Ver redes separadas"
 * colors every run by its network (admin / cameras / guests / production) to
 * show segmentation on one fiber. Illustrative layouts (lib/floors), captioned
 * as such; the CTA opens the project brief with the space pre-answered.
 *
 * Interactive points are real buttons over the drawing (keyboard, 24 px+
 * targets); the drawing itself is decorative. Flowing light on the selected
 * run stops under reduced motion / paused animations (global rules).
 */
export default function FloorLab() {
  const t = useTranslations("business.floor")
  const tb = useTranslations("business")
  const uid = useId()
  const [space, setSpace] = useState<BriefSpace>("offices")
  const [selected, setSelected] = useState<Selected>({ kind: "element", id: CLOSET_ID })
  const [segments, setSegments] = useState(false)
  const plan = FLOORS[space]
  const counts = useMemo(() => kindCounts(plan), [plan])
  const { from, to } = business.internalNetworkGbps
  const gb = business.sampleFileGb

  const roomName = (room: string) => {
    const { id, n } = roomKey(room)
    return t(`rooms.${id}`, { n: n ?? 0 })
  }
  const isLit = (e: FloorElement) =>
    selected.kind === "element" ? selected.id === e.id : selected.kind === "type" && selected.type === e.kind
  const sel =
    selected.kind === "element" && selected.id !== CLOSET_ID ? plan.elements.find((e) => e.id === selected.id) ?? null : null
  const detailKind: ElementKind = selected.kind === "type" ? selected.type : sel ? sel.kind : "closet"
  const detailRoom = selected.kind === "type" ? null : sel ? sel.room : plan.closet.room

  const pickSpace = (s: BriefSpace) => {
    setSpace(s)
    setSelected({ kind: "element", id: CLOSET_ID })
  }

  const DetailIcon = ICONS[detailKind]

  return (
    <div className="biz-frame overflow-hidden">
      {/* Controls: space type + segmentation toggle. */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--biz-line)] px-4 py-4 sm:px-6">
        <fieldset>
          <legend className="sr-only">{t("spaceLabel")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {BRIEF_SPACES.map((s) => (
              <label
                key={s}
                className={cn(
                  "cursor-pointer rounded-[4px] border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--biz-accent)]",
                  space === s ? "border-[var(--biz-accent)] bg-[var(--biz-accent-soft)] text-white" : "border-[var(--biz-line)] text-zinc-300 hover:border-white/30"
                )}
              >
                <input type="radio" name={`${uid}-space`} className="sr-only" checked={space === s} onChange={() => pickSpace(s)} />
                {t(`spaces.${s}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex cursor-pointer items-center gap-3 rounded-[4px] text-sm text-zinc-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--biz-accent)]">
          <input type="checkbox" className="peer sr-only" checked={segments} onChange={(e) => setSegments(e.target.checked)} />
          <span aria-hidden className="relative h-5 w-9 rounded-full border border-white/20 bg-white/[0.06] transition-colors peer-checked:border-[var(--biz-accent)] peer-checked:bg-[var(--biz-accent)]/40 after:absolute after:top-0.5 after:left-0.5 after:size-3.5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
          {t("segmentsToggle")}
        </label>
      </div>

      <div className="grid lg:grid-cols-[1.65fr_1fr]">
        {/* The plan. */}
        <div className="relative border-[var(--biz-line)] p-3 sm:p-5 lg:border-r">
          <div className="relative" style={{ aspectRatio: `${PLAN_W} / ${PLAN_H}` }}>
            <svg viewBox={`0 0 ${PLAN_W} ${PLAN_H}`} className="absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <pattern id={`${uid}-grid`} width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M40 0H0V40" fill="none" stroke="#ffffff" strokeOpacity="0.035" />
                </pattern>
              </defs>
              <rect x="0" y="0" width={PLAN_W} height={PLAN_H} fill={`url(#${uid}-grid)`} />
              {/* Rooms: walls as hairlines, the closet's room tinted. */}
              {plan.rooms.map((r) => {
                const id = r.n ? `${r.id}-${r.n}` : r.id
                return (
                  <g key={id}>
                    <rect
                      x={r.x}
                      y={r.y}
                      width={r.w}
                      height={r.h}
                      fill={id === plan.closet.room ? "rgb(167 139 250 / 0.07)" : "rgb(255 255 255 / 0.012)"}
                      stroke="#ffffff"
                      strokeOpacity="0.28"
                      strokeWidth="2"
                    />
                    <text x={r.x + 14} y={r.y + r.h - 14} className="hidden fill-zinc-400 font-mono text-[12px] tracking-[0.06em] uppercase sm:block">
                      {roomName(id)}
                    </text>
                  </g>
                )
              })}
              {/* Corridor. */}
              <line x1="40" x2="960" y1={plan.corridorY} y2={plan.corridorY} stroke="#ffffff" strokeOpacity="0.08" strokeDasharray="2 8" />
              {/* Fiber runs: dim by default, colored by network in segment view, the selection lit and flowing. */}
              {plan.elements.map((e) => {
                const lit = isLit(e) || (selected.kind === "element" && selected.id === CLOSET_ID)
                const color = segments ? SEG_COLOR[e.seg] : "#c4b5fd"
                return (
                  <path
                    key={e.id}
                    d={fiberRun(plan, e)}
                    fill="none"
                    stroke={color}
                    strokeOpacity={lit ? 0.95 : segments ? 0.55 : 0.2}
                    strokeWidth={lit ? 2.5 : 1.5}
                    strokeLinejoin="round"
                    className={cn(lit && "floor-run-lit")}
                    style={lit ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined}
                  />
                )
              })}
            </svg>

            {/* Points: real buttons over the drawing. */}
            <button
              type="button"
              aria-pressed={selected.kind === "element" && selected.id === CLOSET_ID}
              aria-label={`${t("kinds.closet.name")}, ${roomName(plan.closet.room)}`}
              onClick={() => setSelected({ kind: "element", id: CLOSET_ID })}
              className="floor-point floor-point-closet"
              style={{ left: `${(plan.closet.x / PLAN_W) * 100}%`, top: `${(plan.closet.y / PLAN_H) * 100}%` }}
            >
              <Server className="size-3.5 sm:size-4" aria-hidden />
            </button>
            {plan.elements.map((e) => {
              const Icon = ICONS[e.kind]
              const lit = isLit(e)
              return (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={selected.kind === "element" && selected.id === e.id}
                  aria-label={`${t(`kinds.${e.kind}.name`)}, ${roomName(e.room)}`}
                  onClick={() => setSelected({ kind: "element", id: e.id })}
                  className={cn("floor-point", lit && "floor-point-lit")}
                  style={{
                    left: `${(e.x / PLAN_W) * 100}%`,
                    top: `${(e.y / PLAN_H) * 100}%`,
                    ...(segments ? { borderColor: SEG_COLOR[e.seg], color: SEG_COLOR[e.seg] } : {}),
                  }}
                >
                  <Icon className="size-3 sm:size-3.5" aria-hidden />
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1">
            {segments ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-300" aria-label={t("segmentsLegend")}>
                {SEGMENTS.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: SEG_COLOR[s] }} />
                    {t(`segments.${s}`)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-400">{t("hint")}</p>
            )}
            <p className="text-xs text-zinc-400">{t("caption")}</p>
          </div>
        </div>

        {/* Detail + inventory (the plan's text equivalent). */}
        <div className="flex flex-col border-t border-[var(--biz-line)] lg:border-t-0">
          <div className="p-5 sm:p-6" aria-live="polite">
            <p className="flex items-center gap-3 text-xs text-zinc-400">
              <span className="flex size-8 items-center justify-center rounded-[4px] border border-[var(--biz-accent)]/60 bg-[var(--biz-accent-soft)] text-violet-200">
                <DetailIcon className="size-4" aria-hidden />
              </span>
              {detailRoom ? roomName(detailRoom) : t("allOfType", { count: counts[detailKind] ?? 0 })}
            </p>
            <h4 className="mt-4 text-xl font-medium tracking-[-0.02em] text-white">{t(`kinds.${detailKind}.name`)}</h4>
            <p className="mt-2 leading-relaxed text-zinc-400">
              {t(`kinds.${detailKind}.body`, { gb, from, to, tTo: Math.max(1, Math.round(transferSeconds(gb, to))) })}
            </p>
            {sel && (
              <p className="mt-4 inline-flex items-center gap-2 text-xs text-zinc-300">
                <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: SEG_COLOR[sel.seg] }} />
                {t("onNetwork", { network: t(`segments.${sel.seg}`) })}
              </p>
            )}
          </div>

          <div className="border-t border-[var(--biz-line)] p-5 sm:p-6">
            <h4 className="text-xs text-zinc-400">{t("inventory", { count: plan.elements.length })}</h4>
            <ul className="mt-3 grid grid-cols-2 gap-1.5">
              {ELEMENT_KINDS.filter((k) => k !== "closet" && counts[k]).map((k) => {
                const Icon = ICONS[k]
                const on = selected.kind === "type" && selected.type === k
                return (
                  <li key={k}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected(on ? { kind: "element", id: CLOSET_ID } : { kind: "type", type: k })}
                      className={cn(
                        "flex w-full min-h-10 items-center gap-2.5 rounded-[4px] border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--biz-accent)] focus-visible:outline-none",
                        on ? "border-[var(--biz-accent)] bg-[var(--biz-accent-soft)] text-white" : "border-[var(--biz-line)] text-zinc-300 hover:border-white/30"
                      )}
                    >
                      <Icon className="size-3.5 shrink-0 text-[var(--biz-accent)]" aria-hidden />
                      <span className="flex-1 truncate">{t(`kinds.${k}.short`)}</span>
                      <span className="font-mono text-xs text-zinc-400 tabular-nums">{counts[k]}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="mt-auto border-t border-[var(--biz-line)] p-5 sm:p-6">
            <QuoteButton
              context="business_floor"
              message={tb("fiber.whatsappMessage")}
              preset={{ needs: ["fiberLan"], space }}
              className="w-full"
            />
            <p className="mt-2 text-center text-xs text-zinc-400">{t("ctaNote", { space: tb(`spaces.${space}`) })}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
