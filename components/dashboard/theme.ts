/**
 * The Tablero's chart look (dataviz reference palette, dark mode, validated on the /interno card surface #0e0e10: all
 * checks pass for slots 1–4). Hairline solid grid, recessive axes, the site's sans, dark tooltips. Pure option builders.
 */
import type { EChartsCoreOption } from "echarts/core"

/** Categorical slots (identity), in their fixed order. */
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500"] as const
/** Ordinal blue steps for ordered stages (funnel, age bands): darkest first, never darker than step 600 on dark. */
export const ORDINAL = ["#184f95", "#1c5cab", "#256abf", "#3987e5", "#5598e7"] as const
/** Sequential blue for magnitude (heatmap), near-surface to strong. */
export const SEQUENTIAL = ["#1a2433", "#184f95", "#2a78d6", "#5598e7", "#9ec5f4"] as const
/** Status (only when the color means good / warning / bad). */
export const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" } as const
export const INK = { primary: "#f0efec", secondary: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835", surface: "#0e0e10" } as const

const FONT = "Geist, ui-sans-serif, system-ui, sans-serif"

export const base = (reduced: boolean): EChartsCoreOption => ({
  animation: !reduced,
  animationDuration: 500,
  textStyle: { color: INK.secondary, fontFamily: FONT, fontSize: 12 },
  aria: { enabled: true },
  tooltip: {
    backgroundColor: "#18181b",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: INK.primary, fontFamily: FONT, fontSize: 12 },
    extraCssText: "border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.45)",
  },
})

export const grid = (p: Partial<Record<"top" | "right" | "bottom" | "left", number>> = {}) => ({ top: 28, right: 16, bottom: 28, left: 8, containLabel: true, ...p })

export const categoryAxis = (data: string[], extra: Record<string, unknown> = {}) => ({
  type: "category",
  data,
  axisLine: { lineStyle: { color: INK.axis } },
  axisTick: { show: false },
  axisLabel: { color: INK.muted, hideOverlap: true },
  ...extra,
})

export const valueAxis = (fmt?: (n: number) => string, extra: Record<string, unknown> = {}) => ({
  type: "value",
  splitLine: { lineStyle: { color: INK.grid, width: 1 } },
  axisLine: { show: false },
  axisLabel: { color: INK.muted, formatter: fmt },
  ...extra,
})

export const legend = (extra: Record<string, unknown> = {}) => ({ top: 0, left: 0, icon: "roundRect", itemWidth: 12, itemHeight: 4, textStyle: { color: INK.secondary }, ...extra })

/** A 2 px line with markers only on hover, as the reference specs. */
export const line = (name: string, data: (number | null)[], color: string, extra: Record<string, unknown> = {}) => ({
  type: "line",
  name,
  data,
  color,
  lineStyle: { width: 2 },
  symbol: "circle",
  symbolSize: 8,
  showSymbol: false,
  emphasis: { focus: "series" },
  ...extra,
})

/** Thin bars with 4 px rounded data ends. */
export const bar = (name: string, data: unknown[], color: string, extra: Record<string, unknown> = {}) => ({
  type: "bar",
  name,
  data,
  color,
  barMaxWidth: 22,
  itemStyle: { borderRadius: [4, 4, 0, 0] },
  ...extra,
})
