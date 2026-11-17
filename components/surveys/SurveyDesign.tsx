"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import {
  CLASS_TX,
  GPON_CLASSES,
  SPLIT_RATIOS,
  TAP_RATIOS,
  balancedDesign,
  designResults,
  newStop,
  suggestTaps,
  summarize,
  tapDesign,
  type Branch,
  type Design,
  type Feed,
  type Optics,
  type Stop,
  type StopResult,
  type TapRatio,
} from "@/lib/survey/design"
import { newId } from "@/lib/survey/id"
import type { Tower } from "@/lib/survey/model"
import { AddButton, GRID, PickField } from "./SurveyFields"
import type { SectionProps } from "./SurveySections"

type T = ReturnType<typeof useTranslations>

const TONE: Record<StopResult["status"], string> = {
  ok: "border-emerald-400/40 text-emerald-300",
  tight: "border-amber-400/40 text-amber-200",
  no: "border-red-400/40 text-red-300",
  overload: "border-red-400/40 text-red-300",
  noSplit: "border-white/15 text-zinc-300",
}
const SMALL_BTN = "min-h-9 rounded-full border border-white/15 px-3 text-xs text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** Fiber design per tower and the light per floor box (phase 2). */
export function DesignSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos.design")
  const towers = s.towers.filter((x) => x.floors.length)
  const [pick, setPick] = useState(towers[0]?.id ?? "")
  const tower = towers.find((x) => x.id === pick) ?? towers[0]
  const o = s.optics
  const setOptics = (p: Partial<Optics>) => set({ ...s, optics: { ...o, ...p } })
  const setDesign = (d: Design | null) => tower && set({ ...s, towers: s.towers.map((x) => (x.id === tower.id ? { ...x, design: d } : x)) })
  return (
    <div className="grid gap-6">
      <p className="text-sm leading-relaxed text-zinc-300">{t("intro")}</p>
      <OpticsPanel t={t} o={o} set={setOptics} />
      {!tower ? (
        <p className="text-sm text-zinc-400">{t("noFloors")}</p>
      ) : (
        <>
          {towers.length > 1 && (
            <PickField label={t("tower")} value={tower.id} onChange={setPick} options={towers.map((x) => ({ value: x.id, label: x.name || x.id.slice(0, 6) }))} />
          )}
          <Template t={t} tower={tower} o={o} onApply={setDesign} />
          {tower.design ? <Editor t={t} tower={tower} d={tower.design} o={o} set={setDesign} toDuctM={s.room.toDuctM} /> : <p className="text-sm text-zinc-400">{t("empty")}</p>}
          {tower.design && <Results t={t} tower={tower} d={tower.design} o={o} toDuctM={s.room.toDuctM} />}
        </>
      )}
    </div>
  )
}

function OpticsPanel({ t, o, set }: { t: T; o: Optics; set: (p: Partial<Optics>) => void }) {
  return (
    <div className="grid gap-4 rounded-xl border border-white/10 p-4">
      <p className="text-sm font-medium text-foreground">{t("opticsTitle")}</p>
      <div className={GRID}>
        <PickField label={t("cls")} value={o.cls} onChange={(cls) => set({ cls, txDbm: CLASS_TX[cls] ?? o.txDbm })} options={GPON_CLASSES.map((c) => ({ value: c, label: c }))} />
        <NumberField label={t("tx")} unit="dBm" min={-10} max={20} value={o.txDbm} onChange={(v) => v !== null && set({ txDbm: v })} hint={t("txHint")} />
        <NumberField label={t("sens")} unit="dBm" min={-40} max={0} value={o.ontSensitivity} onChange={(v) => v !== null && set({ ontSensitivity: v })} hint={t("sensHint")} />
        <NumberField label={t("overload")} unit="dBm" min={-30} max={10} value={o.ontOverload} onChange={(v) => v !== null && set({ ontOverload: v })} hint={t("overloadHint")} />
        <NumberField label={t("margin")} unit="dB" min={0} max={15} value={o.marginDb} onChange={(v) => v !== null && set({ marginDb: v })} hint={t("marginHint")} />
      </div>
      <details className="rounded-xl border border-white/10">
        <summary className="cursor-pointer rounded-xl p-3 text-sm text-zinc-200 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">{t("lossesTitle")}</summary>
        <div className="grid gap-4 px-3 pb-4">
          <div className={GRID}>
            <NumberField label={t("connector")} unit="dB" max={3} value={o.connectorDb} onChange={(v) => v !== null && set({ connectorDb: v })} />
            <NumberField label={t("splice")} unit="dB" max={1} value={o.spliceDb} onChange={(v) => v !== null && set({ spliceDb: v })} />
            <PickField label={t("joint")} value={o.joint} onChange={(joint) => set({ joint })} options={(["splice", "connector"] as const).map((x) => ({ value: x, label: t(`joints.${x}`) }))} />
            <NumberField label={t("fixedConnectors")} unit="#" integer max={20} value={o.fixedConnectors} onChange={(v) => v !== null && set({ fixedConnectors: v })} hint={t("fixedConnectorsHint")} />
            <NumberField label={t("fiberDb")} unit="dB/km" max={2} value={o.fiberDbKm} onChange={(v) => v !== null && set({ fiberDbKm: v })} />
            <NumberField label={t("floorHeight")} unit="m" min={1} max={20} value={o.floorHeightM} onChange={(v) => v !== null && set({ floorHeightM: v })} />
            <NumberField label={t("slack")} unit="%" max={100} value={o.slackPct} onChange={(v) => v !== null && set({ slackPct: v })} />
            <NumberField label={t("dropSlack")} unit="m" max={50} value={o.dropSlackM} onChange={(v) => v !== null && set({ dropSlackM: v })} />
          </div>
          <p className="text-sm font-medium text-foreground">{t("tapsTitle")}</p>
          <div className={GRID}>
            {o.taps.flatMap((tp) => [
              <NumberField key={`${tp.pct}s`} label={t("tapSmall", { pct: tp.pct, rest: 100 - tp.pct })} unit="dB" max={30} value={tp.small} onChange={(v) => v !== null && set({ taps: o.taps.map((x) => (x.pct === tp.pct ? { ...x, small: v } : x)) })} />,
              <NumberField key={`${tp.pct}l`} label={t("tapLarge", { pct: tp.pct, rest: 100 - tp.pct })} unit="dB" max={10} value={tp.large} onChange={(v) => v !== null && set({ taps: o.taps.map((x) => (x.pct === tp.pct ? { ...x, large: v } : x)) })} />,
            ])}
          </div>
          <p className="text-xs leading-snug text-zinc-400">{t("tapsHint")}</p>
        </div>
      </details>
    </div>
  )
}

const ratioOptions = (none: string) => [{ value: "1", label: none }, ...SPLIT_RATIOS.map((r) => ({ value: String(r), label: `1:${r}` }))]

function Template({ t, tower, o, onApply }: { t: T; tower: Tower; o: Optics; onApply: (d: Design) => void }) {
  const [kind, setKind] = useState<"balanced" | "taps">("balanced")
  const [feeds, setFeeds] = useState("1")
  const [per, setPer] = useState("2")
  const [base, setBase] = useState("auto")
  const [floor, setFloor] = useState("auto")
  const apply = () => {
    if (tower.design && !window.confirm(t("confirmReplace", { tower: tower.name }))) return
    const fl = floor === "auto" ? "auto" : Number(floor)
    onApply(kind === "balanced" ? balancedDesign(tower, { feeds: Number(feeds), perBox: Number(per), base: base === "auto" ? "auto" : Number(base), floor: fl }) : tapDesign(tower, { feeds: Number(feeds), perBox: Number(per), floor: fl }, o))
  }
  return (
    <div className="grid gap-4 rounded-xl border border-white/10 p-4">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-foreground">{t("templateTitle")}</p>
        <p className="text-xs leading-snug text-zinc-400">{t("templateHint")}</p>
      </div>
      <div className={GRID}>
        <PickField label={t("kind")} value={kind} onChange={setKind} options={(["balanced", "taps"] as const).map((x) => ({ value: x, label: t(`kinds.${x}`) }))} />
        <PickField label={t("feeds")} value={feeds} onChange={setFeeds} options={["1", "2", "3", "4"].map((x) => ({ value: x, label: x }))} />
        <PickField label={t("perBox")} value={per} onChange={setPer} options={["1", "2", "3"].map((x) => ({ value: x, label: t(`perBoxes.${x}`) }))} />
        {kind === "balanced" && <PickField label={t("baseRatio")} value={base} onChange={setBase} options={[{ value: "auto", label: t("auto") }, ...SPLIT_RATIOS.map((r) => ({ value: String(r), label: `1:${r}` }))]} />}
        <PickField label={t("floorRatio")} value={floor} onChange={setFloor} options={[{ value: "auto", label: t("auto") }, ...SPLIT_RATIOS.map((r) => ({ value: String(r), label: `1:${r}` }))]} />
      </div>
      <button type="button" onClick={apply} className="h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-fit">
        {t("apply")}
      </button>
    </div>
  )
}

function floorLabel(t: T, level: number) {
  return level === 0 ? t("floorName.ground") : level < 0 ? t("floorName.basement", { n: -level }) : String(level)
}

function Editor({ t, tower, d, o, set, toDuctM }: { t: T; tower: Tower; d: Design; o: Optics; set: (d: Design) => void; toDuctM: number | null }) {
  const levels = tower.floors.map((f) => f.level)
  const levelOptions = levels.map((l) => ({ value: String(l), label: floorLabel(t, l) }))
  const upFeed = (id: string, p: Partial<Feed>) => set({ ...d, feeds: d.feeds.map((f) => (f.id === id ? { ...f, ...p } : f)) })
  const upBranch = (f: Feed, id: string, p: Partial<Branch>) => upFeed(f.id, { branches: f.branches.map((b) => (b.id === id ? { ...b, ...p } : b)) })
  const upStop = (f: Feed, b: Branch, id: string, p: Partial<Stop>) => upBranch(f, b.id, { stops: b.stops.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  const top = levels[levels.length - 1] ?? 0
  return (
    <div className="grid gap-4">
      <h4 className="text-base font-medium text-foreground">{t("editorTitle", { tower: tower.name })}</h4>
      <div className={GRID}>
        <PickField label={t("baseLevel")} value={String(d.baseLevel)} onChange={(v) => set({ ...d, baseLevel: Number(v) })} options={levelOptions} />
      </div>
      {d.feeds.map((f) => (
        <div key={f.id} role="group" aria-label={t("feed", { name: f.name })} className="grid gap-4 rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t("feed", { name: f.name })}</p>
            {d.feeds.length > 1 && (
              <button type="button" className={SMALL_BTN} onClick={() => set({ ...d, feeds: d.feeds.filter((x) => x.id !== f.id) })}>
                {t("removeFeed")}
              </button>
            )}
          </div>
          <div className={GRID}>
            <TextField label={t("feedName")} value={f.name} onChange={(v) => upFeed(f.id, { name: v.slice(0, 20) })} />
            <PickField label={t("base")} value={String(f.base)} onChange={(v) => upFeed(f.id, { base: Number(v) })} options={ratioOptions(t("none"))} />
          </div>
          {f.branches.map((b, bi) => (
            <div key={b.id} role="group" aria-label={`${f.name} · ${t("branch", { n: bi + 1 })}`} className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-100">{t("branch", { n: bi + 1 })}</p>
                <div className="flex flex-wrap gap-2">
                  {b.stops.length > 1 && (
                    <button type="button" className={SMALL_BTN} title={t("suggestHint")} onClick={() => upBranch(f, b.id, suggestTaps(b, f, d, tower, o, { toDuctM }))}>
                      {t("suggest")}
                    </button>
                  )}
                  <button type="button" className={SMALL_BTN} onClick={() => upFeed(f.id, { branches: f.branches.filter((x) => x.id !== b.id) })}>
                    {t("removeBranch")}
                  </button>
                </div>
              </div>
              {b.stops.map((st, si) => (
                <div key={st.id} className="grid gap-3 border-t border-white/5 pt-3 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-xs text-zinc-300">{t("stop", { n: si + 1 })}</p>
                    {b.stops.length > 1 && (
                      <button type="button" className={SMALL_BTN} onClick={() => upBranch(f, b.id, { stops: b.stops.filter((x) => x.id !== st.id) })}>
                        {t("removeStop")}
                      </button>
                    )}
                  </div>
                  <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <PickField label={t("level")} value={String(st.level)} onChange={(v) => upStop(f, b, st.id, { level: Number(v) })} options={levelOptions} />
                    <PickField
                      label={t("tap")}
                      value={st.tap ? String(st.tap) : ""}
                      onChange={(v) => upStop(f, b, st.id, { tap: v ? (Number(v) as TapRatio) : null })}
                      options={[{ value: "", label: t("noTap") }, ...TAP_RATIOS.map((p) => ({ value: String(p), label: `${p}/${100 - p}` }))]}
                    />
                    <PickField label={t("split")} value={String(st.split)} onChange={(v) => upStop(f, b, st.id, { split: Number(v) })} options={[{ value: "0", label: t("noSplit") }, ...SPLIT_RATIOS.map((r) => ({ value: String(r), label: `1:${r}` }))]} />
                    <PickField label={t("serves")} value={String(st.serves)} onChange={(v) => upStop(f, b, st.id, { serves: Number(v) })} options={["1", "2", "3"].map((x) => ({ value: x, label: t(`servesN.${x}`) }))} />
                  </div>
                </div>
              ))}
              <button
                type="button"
                className={`${SMALL_BTN} w-fit`}
                onClick={() => {
                  const last = b.stops[b.stops.length - 1]
                  const next = last ? Math.min(top, last.level + last.serves) : d.baseLevel
                  upBranch(f, b.id, { stops: [...b.stops.map((x, i) => (i === b.stops.length - 1 && !x.tap ? { ...x, tap: 10 as TapRatio } : x)), newStop(next)] })
                }}
              >
                + {t("addStop")}
              </button>
            </div>
          ))}
          <AddButton onClick={() => upFeed(f.id, { branches: [...f.branches, { id: newId(), stops: [newStop(levels.find((l) => l >= 0) ?? 0)] }] })}>{t("addBranch")}</AddButton>
        </div>
      ))}
      <AddButton disabled={d.feeds.length >= 8} onClick={() => set({ ...d, feeds: [...d.feeds, { id: newId(), name: `F${d.feeds.length + 1}`, base: 1, branches: [] }] })}>
        {t("addFeed")}
      </AddButton>
    </div>
  )
}

function Results({ t, tower, d, o, toDuctM }: { t: T; tower: Tower; d: Design; o: Optics; toDuctM: number | null }) {
  const r = designResults(tower, d, { room: { toDuctM } }, o)
  const sum = summarize(tower, d, r)
  const where = (x: StopResult) => (x.levels.length > 1 ? t("rowFloors", { from: floorLabel(t, x.levels[0]), to: floorLabel(t, x.levels[x.levels.length - 1]) }) : t("rowFloor", { from: floorLabel(t, x.levels[0]) }))
  return (
    <div className="grid gap-3" aria-live="polite">
      <div className="grid gap-1">
        <h4 className="text-base font-medium text-foreground">{t("resultsTitle")}</h4>
        <p className="text-xs text-zinc-400">{t("resultsHint", { cls: o.cls, tx: o.txDbm })}</p>
      </div>
      <ul className="grid gap-1.5 text-sm text-zinc-300">
        <li>{t("summary", { ports: sum.ports, units: sum.units, feeds: sum.feeds })}</li>
        {sum.worst && <li>{t("worst", { where: where(sum.worst), rx: sum.worst.rxDbm })}</li>}
        {sum.uncovered.length > 0 && <li className="text-amber-200">{t("uncovered", { floors: sum.uncovered.map((l) => floorLabel(t, l)).join(", ") })}</li>}
        {sum.short > 0 && <li className="text-amber-200">{t("short", { n: sum.short })}</li>}
        {sum.overBase.length > 0 && <li className="text-red-300">{t("overBase", { feeds: sum.overBase.join(", ") })}</li>}
      </ul>
      <ul className="grid gap-2">
        {r.map((x) => (
          <li key={x.stop.id} className="grid gap-1 rounded-xl border border-white/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-zinc-100">
                {x.feed} · R{x.branch} · {where(x)}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[x.status]}`}>{t(`status.${x.status}`)}</span>
            </div>
            <p className="font-mono text-xs leading-relaxed text-zinc-300">
              {x.stop.tap ? `tap ${x.stop.tap}/${100 - x.stop.tap} · ` : ""}
              {x.stop.split > 1 ? `1:${x.stop.split} · ` : ""}
              {t("rowUnits", { units: x.units, ports: x.ports })} · {t("rowLoss", { loss: x.lossDb })} · <span className="text-zinc-100">{t("rowRx", { rx: x.rxDbm })}</span> · {t("rowSpare", { spare: x.spareDb })}
              {x.throughDbm !== null ? ` · ${t("rowThrough", { through: x.throughDbm })}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
