"use client"

import { useEffect, useRef, useState } from "react"
import type { EChartsCoreOption, EChartsType } from "echarts/core"
import { base } from "./theme"

/** What a chart shows, comparable between renders (functions, like formatters, don't change what's drawn). */
const keyOf = (o: EChartsCoreOption) => JSON.stringify(o, (_, v: unknown) => (typeof v === "function" ? undefined : v))

/**
 * One ECharts chart (Tablero). ECharts loads here only, on demand (the import below happens in the browser after mount,
 * in its own chunk). The chart follows its box's size, has no animation under reduced motion, draws the latest option
 * even if it changed while ECharts was loading, and redraws only when its numbers change (not on every page update).
 * It's an image with a label for screen readers: the numbers are in the panel's table (Panel.tsx).
 */
export function EChart({ option, height, label }: { option: EChartsCoreOption; height: number; label: string }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const latest = useRef(option)
  const drawn = useRef("")
  const [failed, setFailed] = useState(false)
  const draw = (o: EChartsCoreOption) => {
    const key = keyOf(o)
    if (!chart.current || key === drawn.current) return
    drawn.current = key
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    chart.current.setOption({ ...base(reduced), ...o }, { notMerge: true })
  }
  useEffect(() => {
    let live = true
    let ro: ResizeObserver | null = null
    import("./echarts-setup")
      .then(({ echarts }) => {
        if (!live || !el.current) return
        chart.current = echarts.init(el.current, null, { renderer: "svg" })
        draw(latest.current)
        ro = new ResizeObserver(() => chart.current?.resize())
        ro.observe(el.current)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      ro?.disconnect()
      chart.current?.dispose()
      chart.current = null
      drawn.current = ""
    }
    // Made once per mount; option changes go through the effect below (and `latest` for the first draw).
  }, [])
  useEffect(() => {
    latest.current = option
    draw(option)
  }, [option])
  if (failed) return null
  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />
}
