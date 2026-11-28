"use client"

import { useMemo, useState } from "react"
import { siteUnits, tally, unitsOf, type Apartment, type BuiltSite, type BuiltTower, type Resident } from "@/lib/interno/buildings"
import { marginTone, type Margin } from "@/lib/interno/tablero2-tree"
import type { Tone } from "@/lib/interno/tablero2"
import { INK, STATUS } from "@/components/dashboard/theme"
import { Frame, TipBody, type Tip } from "./Frame"
import { pct, pesos } from "./format"

/** The four statuses that owe something this month (the ones a viewer can isolate). */
const PICKS = ["al-corriente", "por-vencer", "atrasado", "suspendido"] as const
type Pick = (typeof PICKS)[number]
type View = "fachada" | "plano"

/** Window glass by status (orange and red only for what's wrong; validated on the dark card). */
export const TONE_COLOR: Record<Tone, string> = { "al-corriente": "#3c5e98", "por-vencer": "#56657a", atrasado: STATUS.serious, suspendido: STATUS.critical, "sin-cobro": "#2b313b" }
/** Paid glass in three steps of one blue: the more a client pays a month, the lighter. */
const PAID = [
  { upTo: 450, top: "#4a6c9c", bottom: "#24385a" },
  { upTo: 700, top: "#5b85bd", bottom: "#2d4a7c" },
  { upTo: Infinity, top: "#7aa6de", bottom: "#3a5f9c" },
] as const
const paidStep = (v: number) => PAID.findIndex((s) => v <= s.upTo)
/** A text mark per status, so color is never the only cue (stacking plan). */
const MARK: Record<Tone, string> = { "al-corriente": "✓", "por-vencer": "○", atrasado: "!", suspendido: "✕", "sin-cobro": "–" }
export const MARGIN_COLOR = { good: "#3987e5", even: "#6f6e69", loss: "#8a8984", none: "transparent" } as const

export type TowerLabels = {
  view: { fachada: string; plano: string; label: string; detailed: string }
  zoom: { title: (floor: string, tower: string) => string; up: string; down: string; hint: string }
  fields: Record<Field, string> & { label: string }
  sites: string
  tower: (name: string) => string
  floor: (n: number) => string
  floorCol: string
  basement: (n: number) => string
  street: string
  monthly: string
  occupancy: (n: number, of: number) => string
  month: string
  paidShare: (share: string) => string
  tones: Record<Tone, string>
  margin: (share: string) => string
  towers: string
  empty: (label: string) => string
  apt: {
    title: (label: string) => string
    client: string
    status: string
    plans: string
    pays: string
    light: string
    lightValue: (rx: number, status: string) => string
    noLight: string
    reports: string
    reportsValue: (n: number, kind: string) => string
    none: string
    occupied: string
    guessed: (written: string) => string
    pick: string
    close: string
  }
  lightStatus: Record<string, string>
  reportKind: (k: string) => string
  source: Record<BuiltTower["source"], string>
  overflow: (n: number) => string
  misplaced: (n: number) => string
  svg: (s: { name: string; residents: number; apartments: number; paid: string }) => string
}

/** What each apartment shows (owner 2026-11-28: "make it toggleable"): tooltip, card, plan cells and facade marks. */
export const FIELDS = ["cliente", "estado", "plan", "monto", "luz", "reportes"] as const
export type Field = (typeof FIELDS)[number]
type Shown = Record<Field, boolean>
const ALL: Shown = { cliente: true, estado: true, plan: true, monto: true, luz: true, reportes: true }
const fieldsKey = "t2-tower-fields"
const readFields = (): Shown => {
  try {
    const v = JSON.parse(localStorage.getItem(fieldsKey) ?? "null") as Partial<Shown> | null
    return v && typeof v === "object" ? { ...ALL, ...Object.fromEntries(FIELDS.filter((f) => typeof v[f] === "boolean").map((f) => [f, v[f]])) } : ALL
  } catch {
    return ALL
  }
}
/** Occupied glass when the status is hidden: one warm light (the view becomes occupancy). */
const OCCUPIED = "url(#tw-lit)"

const detailKey = "t2-tower-detailed"
const readDetailed = () => {
  try {
    return localStorage.getItem(detailKey) === "1"
  } catch {
    return false
  }
}
const viewKey = "t2-tower-view"
const readView = (): View => {
  try {
    return localStorage.getItem(viewKey) === "plano" ? "plano" : "fachada"
  } catch {
    return "fachada"
  }
}

/**
 * Mapa de ingresos as towers (owner 2026-11-28): one deployment at a time (buttons, biggest first), its towers built
 * floor by floor from Despliegues (lib/interno/buildings.ts) and every apartment lit by its client's standing this
 * month. Two views: a drawn facade (rooftop, floors, entrance, basements under the street) and a stacking plan (floors
 * as rows, apartments as cells with number, plan, money and a status mark). Hover or tap an apartment for its client;
 * a tap also pins it in the ledger. The ledger: the deployment's money, the month's standing (buttons that isolate a
 * status), margin, its towers.
 */
export function TowerView({ sites, margins, labels }: { sites: BuiltSite[]; margins: Map<string, Margin>; labels: TowerLabels }) {
  const ranked = useMemo(() => [...sites].map((s) => ({ s, t: tally(siteUnits(s)) })).sort((a, b) => b.t.value - a.t.value || b.s.apartments - a.s.apartments), [sites])
  const [siteId, setSiteId] = useState<string | null>(null)
  // Rendered only once the data has loaded in the browser (never on the server), so storage can be read up front.
  const [view, setView] = useState<View>(readView)
  const [only, setOnly] = useState<Pick | null>(null)
  const [sel, setSel] = useState<{ tower: string; label: string } | null>(null)
  const [shown, setShown] = useState<Shown>(readFields)
  const [detailed, setDetailed] = useState(readDetailed)
  const [zoom, setZoom] = useState<{ tower: string; floor: number } | null>(null)
  const toggleDetailed = () =>
    setDetailed((d) => {
      try {
        localStorage.setItem(detailKey, d ? "0" : "1")
      } catch {
        // Private window: the choice lasts this visit only.
      }
      return !d
    })
  const toggle = (f: Field) =>
    setShown((p) => {
      const next = { ...p, [f]: !p[f] }
      try {
        localStorage.setItem(fieldsKey, JSON.stringify(next))
      } catch {
        // Private window: the choice lasts this visit only.
      }
      return next
    })
  const pickView = (v: View) => {
    setView(v)
    try {
      localStorage.setItem(viewKey, v)
    } catch {
      // Private window: the choice lasts this visit only.
    }
  }
  const cur = ranked.find((r) => r.s.id === siteId) ?? ranked[0]
  if (!cur) return null
  const { s: site, t: st } = cur
  const m = margins.get(site.id)
  const tone = m ? marginTone(m.margin) : "none"
  const selApt = sel ? site.towers.find((t) => t.id === sel.tower)?.floors.flatMap((f) => f.units).find((u) => u.label === sel.label) : undefined
  const choose = (tower: string, a: Apartment) => setSel((p) => (p && p.tower === tower && p.label === a.label ? null : { tower, label: a.label }))
  // On the facade a tap also opens its floor at full size (the windows of a 16 × 16 tower are small on a phone).
  const chooseOnFacade = (tower: string, a: Apartment) => {
    choose(tower, a)
    setZoom({ tower, floor: a.floor })
  }
  const wideFloors = site.towers.some((t) => t.floors.some((f) => f.units.length > COMPACT_OVER))
  const amount = (k: Pick) => st.byTone[k].value

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={labels.sites} className="flex flex-wrap gap-1.5">
          {ranked.map(({ s, t }) => {
            const on = s.id === site.id
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setSiteId(s.id)
                  setSel(null)
                  setZoom(null)
                }}
                className={`grid min-h-11 rounded-xl border px-3 py-1 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${on ? "border-white/35 bg-white/8" : "border-white/8 hover:border-white/20"}`}
              >
                <span className="max-w-44 truncate text-xs text-zinc-100">{s.name}</span>
                <span className="font-mono text-[0.7rem] text-zinc-400 tabular-nums">{pesos(t.value)}</span>
              </button>
            )
          })}
        </div>
        <div role="group" aria-label={labels.view.label} className="ml-auto inline-flex rounded-full border border-white/10 p-0.5 text-xs">
          {(["fachada", "plano"] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => pickView(v)} className={`min-h-9 rounded-full px-3 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${view === v ? "bg-white/12 text-zinc-50" : "text-zinc-400 hover:text-zinc-100"}`}>
              {labels.view[v]}
            </button>
          ))}
        </div>
        {view === "plano" && wideFloors && (
          <button type="button" aria-pressed={detailed} onClick={toggleDetailed} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${detailed ? "border-white/30 bg-white/8 text-zinc-50" : "border-white/8 text-zinc-400 hover:text-zinc-100"}`}>
            <span aria-hidden className={`size-1.5 rounded-full ${detailed ? "bg-[#5598e7]" : "bg-zinc-600"}`} />
            {labels.view.detailed}
          </button>
        )}
      </div>

      <div role="group" aria-label={labels.fields.label} className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-zinc-500">{labels.fields.label}</span>
        {FIELDS.map((f) => (
          <button key={f} type="button" aria-pressed={shown[f]} onClick={() => toggle(f)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${shown[f] ? "border-white/30 bg-white/8 text-zinc-50" : "border-white/8 text-zinc-500 hover:text-zinc-200"}`}>
            <span aria-hidden className={`size-1.5 rounded-full ${shown[f] ? "bg-[#5598e7]" : "bg-zinc-600"}`} />
            {labels.fields[f]}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)]">
        <div className="min-w-0">
          {view === "fachada" ? (
            <>
              <Facade key={site.id} site={site} only={only} sel={sel} zoom={zoom} shown={shown} labels={labels} onPick={chooseOnFacade} onFloor={(tower, floor) => setZoom({ tower, floor })} label={labels.svg({ name: site.name, residents: st.residents, apartments: st.apartments, paid: pct(st.owed ? st.paid / st.owed : null) })} />
              {zoom ? <FloorStrip site={site} at={zoom} only={only} sel={sel} shown={shown} labels={labels} onPick={choose} onFloor={(floor) => setZoom({ ...zoom, floor })} onClose={() => setZoom(null)} /> : <p className="mt-2 text-[0.7rem] text-zinc-500">{labels.zoom.hint}</p>}
            </>
          ) : (
            <Stack key={site.id} site={site} only={only} sel={sel} shown={shown} detailed={detailed} labels={labels} onPick={choose} />
          )}
          {(site.misplaced > 0 || site.overflow > 0) && (
            <p className="mt-2 text-[0.7rem] text-zinc-500">
              {site.misplaced > 0 && labels.misplaced(site.misplaced)} {site.overflow > 0 && labels.overflow(site.overflow)}
            </p>
          )}
        </div>

        <div className="grid gap-5 rounded-2xl border border-white/8 bg-white/[0.02] p-4">
          {selApt && <AptCard tower={site.towers.find((t) => t.id === sel?.tower) as BuiltTower} a={selApt} shown={shown} labels={labels} onClose={() => setSel(null)} />}
          <div>
            <p className="text-[0.7rem] tracking-wide text-zinc-500 uppercase">{labels.monthly}</p>
            <p className="mt-1 font-mono text-3xl font-semibold tracking-tight text-zinc-50 tabular-nums">{pesos(st.value)}</p>
            <p className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
              {labels.occupancy(st.residents, st.apartments)}
              {m && tone !== "none" && (
                <span className={`rounded-full px-1.5 py-px font-mono text-[0.65rem] whitespace-nowrap tabular-nums ${tone === "good" ? "bg-[#3987e5]/20 text-[#9cc3f5]" : tone === "even" ? "bg-white/8 text-zinc-300" : "text-zinc-100"}`} style={tone === "loss" ? { background: `repeating-linear-gradient(45deg, ${MARGIN_COLOR.loss}55 0 3px, transparent 3px 6px)` } : undefined}>
                  {labels.margin(pct(m.margin))}
                </span>
              )}
            </p>
          </div>
          <div className="grid gap-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-zinc-300">{labels.month}</p>
              <p className="font-mono text-xs text-zinc-400 tabular-nums">{labels.paidShare(pct(st.owed ? st.paid / st.owed : null))}</p>
            </div>
            <div aria-hidden className="flex h-2 gap-[2px] overflow-hidden rounded-full">
              {([...PICKS, "sin-cobro"] as const).map((k) => (st.byTone[k].value > 0 ? <span key={k} style={{ flexGrow: st.byTone[k].value, background: TONE_COLOR[k], opacity: only && only !== k ? 0.25 : 1 }} className="transition-opacity" /> : null))}
            </div>
            <div role="group" aria-label={labels.month} className="grid grid-cols-2 gap-1.5">
              {PICKS.map((k) => {
                const pressed = only === k
                return (
                  <button key={k} type="button" aria-pressed={pressed} onClick={() => setOnly(pressed ? null : k)} className={`grid min-h-11 gap-0.5 rounded-xl border px-2.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${pressed ? "border-white/35 bg-white/8" : "border-white/8 hover:border-white/20"}`}>
                    <span className="flex items-center gap-1.5 text-[0.7rem] text-zinc-400">
                      <span aria-hidden className={`size-2 rounded-full ${k === "por-vencer" ? "border border-[#8193ab]" : ""}`} style={{ background: k === "por-vencer" ? "transparent" : TONE_COLOR[k] }} />
                      {labels.tones[k]}
                    </span>
                    <span className="font-mono text-sm text-zinc-100 tabular-nums">
                      {pesos(amount(k))} <span className="text-[0.7rem] text-zinc-500">· {st.byTone[k].n}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid gap-1.5">
            <p className="text-xs text-zinc-300">{labels.towers}</p>
            {site.towers.map((t) => {
              const tt = tally(unitsOf(t))
              return (
                <div key={t.id} className="grid gap-1 px-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm text-zinc-100">{labels.tower(t.name)}</span>
                    <span className="shrink-0 font-mono text-xs text-zinc-300 tabular-nums">{pesos(tt.value)}</span>
                  </span>
                  <span aria-hidden className="relative h-1 overflow-hidden rounded-full bg-white/8">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-white/25" style={{ width: `${(tt.residents / Math.max(1, tt.apartments)) * 100}%` }} />
                    <span className="absolute inset-y-0 left-0 rounded-full bg-[#3987e5]" style={{ width: `${(tt.byTone["al-corriente"].n / Math.max(1, tt.apartments)) * 100}%` }} />
                  </span>
                  <span className="flex justify-between gap-2 text-[0.7rem] text-zinc-500">
                    <span>{labels.occupancy(tt.residents, tt.apartments)}</span>
                    <span>{labels.source[t.source]}</span>
                  </span>
                </div>
              )
            })}
          </div>
          {!selApt && <p className="text-[0.7rem] text-zinc-500">{labels.apt.pick}</p>}
        </div>
      </div>
    </div>
  )
}

/** What the tooltip and the card say about one apartment. */
function aptRows(a: Apartment, shown: Shown, labels: TowerLabels): { label: string; value: string; color?: string }[] {
  const r = a.resident
  if (!r) return [{ label: labels.apt.client, value: labels.apt.none }]
  const rows: [Field, { label: string; value: string; color?: string }][] = [
    ["cliente", { label: labels.apt.client, value: r.name }],
    ["estado", { label: labels.apt.status, value: labels.tones[r.tone], color: TONE_COLOR[r.tone] }],
    ["plan", { label: labels.apt.plans, value: r.plans.join(" + ") || "—" }],
    ["monto", { label: labels.apt.pays, value: pesos(r.value) }],
    ["luz", { label: labels.apt.light, value: r.rx === null ? labels.apt.noLight : labels.apt.lightValue(r.rx, r.light ? labels.lightStatus[r.light] : "") }],
    ["reportes", { label: labels.apt.reports, value: labels.apt.reportsValue(r.reports, r.lastReport ? labels.reportKind(r.lastReport) : "") }],
  ]
  const out = rows.filter(([f]) => shown[f]).map(([, row]) => row)
  // Everything hidden: still say the apartment has a client.
  return out.length ? out : [{ label: labels.apt.client, value: labels.apt.occupied }]
}

function AptCard({ tower, a, shown, labels, onClose }: { tower: BuiltTower; a: Apartment; shown: Shown; labels: TowerLabels; onClose: () => void }) {
  return (
    <div className="grid gap-2 rounded-xl border border-white/15 bg-white/[0.04] p-3" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-zinc-50">
          {labels.apt.title(a.label)} <span className="text-xs font-normal text-zinc-400">· {labels.tower(tower.name)}</span>
        </p>
        <button type="button" onClick={onClose} className="min-h-8 rounded-full px-2 text-xs text-zinc-400 hover:text-zinc-100 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
          {labels.apt.close}
        </button>
      </div>
      <TipBody title="" rows={aptRows(a, shown, labels)} />
      {a.resident && !a.resident.exact && <p className="text-[0.7rem] text-zinc-500">{labels.apt.guessed(a.resident.written)}</p>}
    </div>
  )
}

// ── Facade ──────────────────────────────────────────────────────────────────

const WIN = 15
const BAY = 22
const FH = 26
const SIDE = 16
const ROOF = 54
const GROUND = 34
const BASE_H = 22
const RIGHT = 44
const LEFT = 26

type Placed = { t: BuiltTower; x: number; w: number; units: number }

function Facade({ site, only, sel, zoom, shown, labels, onPick, onFloor, label }: { site: BuiltSite; only: Pick | null; sel: { tower: string; label: string } | null; zoom: { tower: string; floor: number } | null; shown: Shown; labels: TowerLabels; onPick: (tower: string, a: Apartment) => void; onFloor: (tower: string, floor: number) => void; label: string }) {
  // Each tower as tall as itself (a short one under a high-rise on a phone gets no empty sky); bottoms line up.
  // One drawing per tower: side by side when they fit (each as wide as its building), one under another on a phone.
  return (
    <div className="flex flex-wrap items-end gap-y-4">
      {site.towers.map((t, i) => {
        const units = Math.max(1, ...t.floors.map((f) => f.units.length))
        const w = units * BAY + SIDE * 2
        const natW = LEFT + w + RIGHT
        const scaleFor = (bw: number) => Math.min(1.6, Math.max(0.5, bw / natW))
        const p: Placed = { t, x: LEFT, w, units }
        // The deployment's deepest basements under every tower, so the streets line up side by side.
        const maxBase = Math.max(0, ...site.towers.map((x) => x.basements))
        const groundY = ROOF + Math.max(1, t.floors.length) * FH
        const natH = groundY + GROUND + maxBase * BASE_H + 18
        return (
          <div key={t.id} className="min-w-0" style={{ flex: `${natW} 1 ${natW}px` }}>
            <Frame height={(bw) => natH * scaleFor(bw || natW)} label={`${label} · ${labels.tower(t.name)}`}>
              {(bw, tip) => {
                const k = scaleFor(bw)
                const span = bw / k
                const offset = Math.max(0, (span - natW) / 2)
                return (
                  <g transform={`scale(${k}) translate(${offset},0)`}>
                    {i === 0 && <FacadeDefs />}
                    {/* Sky glow behind the tower and the street. */}
                    <rect x={-offset} y={0} width={span} height={groundY} fill="url(#tw-sky)" />
                    <rect x={-offset} y={groundY} width={span} height={GROUND} fill="#141518" />
                    <rect x={-offset} y={groundY} width={span} height={6} fill="#24262b" />
                    <line x1={-offset} x2={span - offset} y1={groundY + 22} y2={groundY + 22} stroke="#3a3c41" strokeDasharray="14 10" />
                    {i === 0 && (
                      <text x={-offset + 6} y={groundY + 18} fontSize={8.5} fill={INK.muted} letterSpacing={2}>
                        {labels.street.toUpperCase()}
                      </text>
                    )}
                    {maxBase > 0 && <rect x={-offset} y={groundY + GROUND} width={span} height={maxBase * BASE_H + 10} fill="#0b0b0d" />}
                    <Tower p={p} groundY={groundY} only={only} sel={sel} zoomed={zoom?.tower === t.id ? zoom.floor : null} shown={shown} labels={labels} tip={tip} onPick={onPick} onFloor={(floor) => onFloor(t.id, floor)} lamp={i < site.towers.length - 1} />
                  </g>
                )
              }}
            </Frame>
          </div>
        )
      })}
    </div>
  )
}

function FacadeDefs() {
  return (
    <defs>
      <linearGradient id="tw-sky" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#0d1320" stopOpacity={0} />
        <stop offset="1" stopColor="#16233a" stopOpacity={0.55} />
      </linearGradient>
      <linearGradient id="tw-body" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#1d1f24" />
        <stop offset="0.5" stopColor="#202329" />
        <stop offset="1" stopColor="#17191d" />
      </linearGradient>
      {PAID.map((s, i) => (
        <linearGradient key={i} id={`tw-paid-${i}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={s.top} />
          <stop offset="1" stopColor={s.bottom} />
        </linearGradient>
      ))}
      <linearGradient id="tw-late" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#f7b391" />
        <stop offset="1" stopColor="#d9683d" />
      </linearGradient>
      <linearGradient id="tw-susp" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#f07777" />
        <stop offset="1" stopColor="#b52d2d" />
      </linearGradient>
      <linearGradient id="tw-dark" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#14171c" />
        <stop offset="0.55" stopColor="#101216" />
        <stop offset="0.56" stopColor="#181b21" />
        <stop offset="1" stopColor="#0f1114" />
      </linearGradient>
      <linearGradient id="tw-lit" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor="#fde68a" />
        <stop offset="1" stopColor="#d9a83a" />
      </linearGradient>
      <filter id="tw-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.4" />
      </filter>
    </defs>
  )
}

const glassOf = (r: Resident | null) => (!r ? "url(#tw-dark)" : r.tone === "al-corriente" ? `url(#tw-paid-${paidStep(r.value)})` : r.tone === "atrasado" ? "url(#tw-late)" : r.tone === "suspendido" ? "url(#tw-susp)" : r.tone === "por-vencer" ? "#141b27" : "#262b33")

function Tower({ p, groundY, only, sel, zoomed, shown, labels, tip, onPick, onFloor, lamp }: { p: Placed; groundY: number; only: Pick | null; sel: { tower: string; label: string } | null; zoomed: number | null; shown: Shown; labels: TowerLabels; tip: Tip; onPick: (tower: string, a: Apartment) => void; onFloor: (floor: number) => void; lamp: boolean }) {
  const { t, x, w } = p
  const floors = t.floors.length
  const top = groundY - floors * FH
  const cx = x + w / 2
  const riserX = x + w - 6
  const tt = tally(unitsOf(t))
  return (
    <g>
      {/* Rooftop: machine room, water tanks, the antenna with its light, our riser box. */}
      <rect x={x + 10} y={top - 22} width={30} height={22} rx={1.5} fill="#1a1c20" stroke="#2c2f35" />
      <rect x={x + 16} y={top - 16} width={8} height={10} fill="#0f1013" />
      {[0, 1, 2].slice(0, w > 120 ? 3 : 2).map((i) => (
        <g key={i} transform={`translate(${x + 52 + i * 19},${top - 17})`}>
          <rect x={0} y={2} width={14} height={15} rx={2} fill="#0c0c0e" stroke="#2a2b2f" />
          <ellipse cx={7} cy={2.5} rx={7} ry={2.5} fill="#1a1a1d" stroke="#2a2b2f" />
          <line x1={2} x2={2} y1={17} y2={20} stroke="#2a2b2f" />
          <line x1={12} x2={12} y1={17} y2={20} stroke="#2a2b2f" />
        </g>
      ))}
      <line x1={riserX} x2={riserX} y1={top - 44} y2={top} stroke="#4a4d55" strokeWidth={1.4} />
      <line x1={riserX - 5} x2={riserX + 5} y1={top - 34} y2={top - 34} stroke="#4a4d55" />
      <path d={`M${riserX - 9},${top - 24} a6,6 0 0,1 8,-6`} fill="none" stroke="#6a6e78" strokeWidth={1.2} />
      <circle cx={riserX} cy={top - 45} r={2} fill="#d03b3b" className="t2-blink" />
      {/* Body, parapet and cornice. */}
      <rect x={x} y={top} width={w} height={floors * FH} fill="url(#tw-body)" stroke="rgba(255,255,255,0.08)" />
      <rect x={x - 3} y={top - 4} width={w + 6} height={5} rx={1} fill="#2a2d33" />
      <rect x={x} y={top} width={4} height={floors * FH} fill="#25282e" />
      <rect x={x + w - 4} y={top} width={4} height={floors * FH} fill="#25282e" />
      {/* The fiber riser up the side, lit. */}
      <line x1={riserX} x2={riserX} y1={top + 2} y2={groundY + t.basements * BASE_H} stroke="#3987e5" strokeOpacity={0.55} strokeWidth={1} />
      <line x1={riserX} x2={riserX} y1={top + 2} y2={groundY + t.basements * BASE_H} stroke="#3987e5" strokeOpacity={0.35} strokeWidth={3} filter="url(#tw-glow)" />
      {t.floors.map((f) => {
        const fy = groundY - f.floor * FH
        const ft = tally(f.units)
        const span = f.units.length * BAY
        const x0 = cx - span / 2
        const ground = f.floor === 1
        const half = Math.ceil(f.units.length / 2)
        return (
          <g key={f.floor}>
            {/* The whole floor is a tap target (opens it at full size); the zoomed one is outlined. */}
            <rect x={x - LEFT + 2} y={fy} width={w + LEFT - 2} height={FH} fill={zoomed === f.floor ? "#5598e7" : "transparent"} fillOpacity={zoomed === f.floor ? 0.1 : 0} stroke={zoomed === f.floor ? "#5598e7" : "none"} strokeOpacity={0.6} style={{ cursor: "zoom-in" }} onClick={() => onFloor(f.floor)} />
            <line x1={x} x2={x + w} y1={fy + FH} y2={fy + FH} stroke="#2a2d33" pointerEvents="none" />
            {(floors <= 14 || f.floor % 2 === 0 || f.floor === 1) && (
              <text x={x - 5} y={fy + FH / 2} dy="0.35em" textAnchor="end" fontSize={8.5} fill={INK.muted} className="font-mono tabular-nums">
                {labels.floor(f.floor)}
              </text>
            )}
            {/* Splitter box on the riser every other floor. */}
            {f.floor % 2 === 0 && <rect x={riserX - 2} y={fy + FH / 2 - 2} width={4} height={4} rx={0.5} fill="#5598e7" />}
            {/* This floor's apartments taken (a tick per client) on the right edge. */}
            <rect x={x + w + 3} y={fy + 5} width={3} height={FH - 10} rx={1} fill="#ffffff" fillOpacity={0.06} />
            <rect x={x + w + 3} y={fy + 5 + (FH - 10) * (1 - ft.residents / Math.max(1, ft.apartments))} width={3} height={(FH - 10) * (ft.residents / Math.max(1, ft.apartments))} rx={1} fill="#5598e7" fillOpacity={0.75} />
            {f.units.map((a, ui) => {
              // The ground floor splits around the entrance.
              const bx = ground ? (ui < half ? x0 - BAY / 2 + ui * BAY : x0 + BAY / 2 + ui * BAY) : x0 + ui * BAY
              const wx = bx + (BAY - WIN) / 2
              const wy = fy + (FH - WIN) / 2 - 1
              const r = a.resident
              const pick = only === null || r?.tone === only
              const on = sel?.tower === t.id && sel.label === a.label
              const loud = shown.estado && r && (r.tone === "atrasado" || r.tone === "suspendido")
              return (
                <g
                  key={a.label}
                  opacity={pick ? 1 : 0.16}
                  style={{ transition: "opacity 200ms", cursor: "pointer" }}
                  onPointerMove={(e) => tip.show(e, <TipBody title={`${labels.apt.title(a.label)} · ${labels.tower(t.name)}`} rows={aptRows(a, shown, labels)} />)}
                  onPointerLeave={tip.hide}
                  onClick={() => onPick(t.id, a)}
                >
                  {loud && pick && r && <rect x={wx - 1} y={wy - 1} width={WIN + 2} height={WIN + 2} rx={2} fill={r.tone === "suspendido" ? STATUS.critical : STATUS.serious} opacity={0.6} filter="url(#tw-glow)" />}
                  <rect x={wx} y={wy} width={WIN} height={WIN} rx={1.5} fill={r && !shown.estado ? OCCUPIED : glassOf(r)} stroke={on ? "#ffffff" : shown.estado && r?.tone === "por-vencer" ? "#7d8ca3" : r && !r.exact ? "#8fa3c2" : "rgba(255,255,255,0.07)"} strokeWidth={on ? 1.6 : 1} strokeDasharray={r && !r.exact && !on ? "2 1.5" : undefined} />
                  {/* Mullion and a curtain for the lit ones. */}
                  <line x1={wx + WIN / 2} x2={wx + WIN / 2} y1={wy} y2={wy + WIN} stroke="#000" strokeOpacity={0.25} />
                  {r && (r.tone !== "por-vencer" || !shown.estado) && <rect x={wx + 1} y={wy + 1} width={3} height={WIN - 2} fill="#fff" fillOpacity={0.1} />}
                  {/* Balcony rail. */}
                  <line x1={wx - 2} x2={wx + WIN + 2} y1={wy + WIN + 3} y2={wy + WIN + 3} stroke="#34373e" strokeWidth={1.2} />
                  {/* An open report: a small amber dot. */}
                  {shown.reportes && r && r.reports > 0 && <circle cx={wx + WIN} cy={wy} r={2.6} fill={STATUS.warning} stroke={INK.surface} strokeWidth={0.8} />}
                  {/* Weak or saturated light: a small red tick under the window. */}
                  {shown.luz && r && (r.light === "baja" || r.light === "satura") && <rect x={wx + 3} y={wy + WIN + 1} width={WIN - 6} height={1.5} fill={STATUS.critical} />}
                </g>
              )
            })}
            {ground && (
              <g pointerEvents="none">
                <rect x={cx - BAY / 2 + 3} y={fy + 4} width={BAY - 6} height={FH - 4} rx={1} fill="#2f3a4c" stroke="#4b5a72" />
                <line x1={cx} x2={cx} y1={fy + 4} y2={groundY} stroke="#4b5a72" />
                <rect x={cx - BAY / 2} y={fy + 1} width={BAY} height={3} fill="#3a3d44" />
              </g>
            )}
          </g>
        )
      })}
      {/* Basements under the street. */}
      {Array.from({ length: t.basements }, (_, b) => {
        const by = groundY + GROUND - 6 + b * BASE_H
        return (
          <g key={b} pointerEvents="none">
            <rect x={x} y={by} width={w} height={BASE_H} fill="#121316" stroke="#22242a" />
            {Array.from({ length: Math.floor((w - 12) / 16) }, (_, i) => (
              <line key={i} x1={x + 10 + i * 16} x2={x + 10 + i * 16} y1={by + 5} y2={by + BASE_H - 5} stroke="#2e3036" />
            ))}
            <text x={x - 5} y={by + BASE_H / 2} dy="0.35em" textAnchor="end" fontSize={8.5} fill={INK.muted} className="font-mono">
              {labels.basement(b + 1)}
            </text>
          </g>
        )
      })}
      {/* The tower's name and money above its roof. */}
      <g pointerEvents="none">
        <text x={x} y={top - 30} fontSize={11.5} fontWeight={600} fill={INK.primary}>
          {labels.tower(t.name)}
        </text>
        <text x={x} y={top - 30} dy={-13} fontSize={9.5} fill={INK.secondary} className="font-mono tabular-nums">
          {`${pesos(tt.value)} · ${tt.residents}/${tt.apartments}`}
        </text>
      </g>
      {/* A street lamp and a tree beside the tower. */}
      {lamp && (
        <g pointerEvents="none" transform={`translate(${x + w + 24},${groundY})`}>
          <circle cx={-8} cy={-14} r={9} fill="#14261d" />
          <circle cx={-3} cy={-19} r={7} fill="#183024" />
          <rect x={-9} y={-6} width={2} height={6} fill="#2a2016" />
          <line x1={8} x2={8} y1={0} y2={-34} stroke="#3a3c41" strokeWidth={1.5} />
          <line x1={8} x2={14} y1={-34} y2={-34} stroke="#3a3c41" strokeWidth={1.5} />
          <circle cx={14} cy={-32} r={2.2} fill="#fcd34d" />
          <circle cx={14} cy={-32} r={6} fill="#fcd34d" opacity={0.25} filter="url(#tw-glow)" />
        </g>
      )}
    </g>
  )
}

// ── Stacking plan ───────────────────────────────────────────────────────────

const CELL_BG: Record<Tone, string> = { "al-corriente": "bg-[#22385c] text-[#d6e5fb]", "por-vencer": "border-[#7d8ca3] bg-transparent text-zinc-200", atrasado: "bg-[#ec835a] text-[#1a0d06]", suspendido: "bg-[#d03b3b] text-white", "sin-cobro": "bg-[#2b313b] text-zinc-200" }

/** Floors wider than this get compact cells in the stacking plan (number and status mark; the rest on hover or tap). */
export const COMPACT_OVER = 8

/** One apartment as a button: the stacking plan's cell and the floor strip's. Compact = number and mark only. */
function AptButton({ a, towerId, compact, only, sel, shown, labels, onPick }: { a: Apartment; towerId: string; compact: boolean; only: Pick | null; sel: { tower: string; label: string } | null; shown: Shown; labels: TowerLabels; onPick: (tower: string, a: Apartment) => void }) {
  const r = a.resident
  const pick = only === null || r?.tone === only
  const on = sel?.tower === towerId && sel.label === a.label
  const detail = r ? [shown.plan ? r.plans.join("+") : "", shown.monto ? pesos(r.value) : ""].filter(Boolean).join(" ") : ""
  const wide = shown.cliente || (shown.plan && shown.monto)
  const size = compact ? "h-9 w-[2.55rem] px-0.5" : `${shown.cliente ? "h-14" : "h-11"} ${wide ? "w-[5.1rem]" : "w-[3.6rem]"} px-1`
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={`${labels.apt.title(a.label)}: ${aptRows(a, shown, labels).map((x) => x.value).join(", ")}`}
      title={compact && r ? aptRows(a, shown, labels).map((x) => x.value).join(" · ") : undefined}
      onClick={() => onPick(towerId, a)}
      className={`relative grid ${size} content-center rounded-md border text-left leading-tight transition-opacity focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none ${r ? (shown.estado ? CELL_BG[r.tone] : "bg-[#d9a83a] text-[#1a1306]") : "border-dashed border-white/10 text-zinc-600"} ${r && (r.tone !== "por-vencer" || !shown.estado) ? "border-transparent" : ""} ${on ? "ring-2 ring-white" : ""} ${r && !r.exact ? "outline-1 outline-offset-[-3px] outline-white/40 outline-dashed" : ""}`}
      style={{ opacity: pick ? 1 : 0.18 }}
    >
      <span className={`flex items-center justify-between font-mono tabular-nums ${compact ? "text-[0.6rem]" : "text-[0.68rem]"}`}>
        {a.label}
        {r && shown.estado && <span aria-hidden>{MARK[r.tone]}</span>}
      </span>
      {!compact && shown.cliente && <span className="truncate text-[0.6rem] font-medium">{r ? r.name : "—"}</span>}
      {!compact && <span className="truncate text-[0.6rem] opacity-80">{r ? detail || " " : "—"}</span>}
      {r && shown.luz && (r.light === "baja" || r.light === "satura") && <span aria-hidden className="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full" style={{ background: STATUS.critical }} />}
      {shown.reportes && r && r.reports > 0 && <span aria-hidden className="absolute -top-1 -right-1 size-2.5 rounded-full border border-[#0e0e10]" style={{ background: STATUS.warning }} />}
    </button>
  )
}

function Stack({ site, only, sel, shown, detailed, labels, onPick }: { site: BuiltSite; only: Pick | null; sel: { tower: string; label: string } | null; shown: Shown; detailed: boolean; labels: TowerLabels; onPick: (tower: string, a: Apartment) => void }) {
  return (
    <div className="grid gap-5">
      {site.towers.map((t) => {
        const tt = tally(unitsOf(t))
        const cols = Math.max(1, ...t.floors.map((f) => f.units.length))
        const compact = !detailed && cols > COMPACT_OVER
        return (
          <div key={t.id} className="grid gap-2">
            <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-zinc-100">
              {labels.tower(t.name)}
              <span className="font-mono text-xs text-zinc-400 tabular-nums">
                {pesos(tt.value)} · {labels.occupancy(tt.residents, tt.apartments)}
              </span>
            </p>
            <div className="overflow-x-auto pb-1">
              <table className="border-separate border-spacing-1 text-left">
                <thead className="sr-only">
                  <tr>
                    <th>{labels.floorCol}</th>
                    {Array.from({ length: cols }, (_, i) => (
                      <th key={i}>{i + 1}</th>
                    ))}
                    <th>{labels.monthly}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...t.floors].reverse().map((f) => {
                    const ft = tally(f.units)
                    return (
                      <tr key={f.floor}>
                        {/* The floor and its money stay in view while the row scrolls sideways. */}
                        <th scope="row" className="sticky left-0 z-10 bg-[#0e0e10] pr-1 text-right font-mono text-[0.7rem] font-normal text-zinc-500 tabular-nums">
                          {labels.floor(f.floor)}
                        </th>
                        {Array.from({ length: cols }, (_, i) => {
                          const a = f.units[i]
                          return <td key={i}>{a && <AptButton a={a} towerId={t.id} compact={compact} only={only} sel={sel} shown={shown} labels={labels} onPick={onPick} />}</td>
                        })}
                        <td className="sticky right-0 z-10 bg-[#0e0e10] pl-2 font-mono text-[0.7rem] whitespace-nowrap text-zinc-400 tabular-nums">
                          {pesos(ft.value)} <span className="text-zinc-600">· {ft.residents}/{ft.apartments}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * The facade's floor zoom (owner 2026-11-28: towers of 16 floors × 16 apartments, too small to tap on a phone): the
 * floor picked on the facade as full-size buttons, with the floor above and below a tap away.
 */
function FloorStrip({ site, at, only, sel, shown, labels, onPick, onFloor, onClose }: { site: BuiltSite; at: { tower: string; floor: number }; only: Pick | null; sel: { tower: string; label: string } | null; shown: Shown; labels: TowerLabels; onPick: (tower: string, a: Apartment) => void; onFloor: (floor: number) => void; onClose: () => void }) {
  const t = site.towers.find((x) => x.id === at.tower)
  const f = t?.floors[at.floor - 1]
  if (!t || !f) return null
  const ft = tally(f.units)
  const step = "min-h-9 rounded-full border border-white/10 px-3 text-xs text-zinc-300 hover:text-zinc-50 disabled:opacity-30 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
  return (
    <section aria-label={labels.zoom.title(labels.floor(f.floor), labels.tower(t.name))} className="mt-3 grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-zinc-100">
          {labels.zoom.title(labels.floor(f.floor), labels.tower(t.name))}
          <span className="ml-2 font-mono text-xs text-zinc-400 tabular-nums">
            {pesos(ft.value)} · {ft.residents}/{ft.apartments}
          </span>
        </p>
        <span className="ml-auto flex gap-1.5">
          <button type="button" className={step} disabled={f.floor >= t.floors.length} onClick={() => onFloor(f.floor + 1)}>
            {labels.zoom.up}
          </button>
          <button type="button" className={step} disabled={f.floor <= 1} onClick={() => onFloor(f.floor - 1)}>
            {labels.zoom.down}
          </button>
          <button type="button" className={step} onClick={onClose}>
            {labels.apt.close}
          </button>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {f.units.map((a) => (
          <AptButton key={a.label} a={a} towerId={t.id} compact={false} only={only} sel={sel} shown={shown} labels={labels} onPick={onPick} />
        ))}
      </div>
    </section>
  )
}
