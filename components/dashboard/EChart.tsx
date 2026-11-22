"use client"

import { useEffect, useRef, useState } from "react"
import type { EChartsCoreOption, EChartsType } from "echarts/core"
import { base } from "./theme"

/**
 * One ECharts chart (Tablero). ECharts loads here only, on demand (next/dynamic is not needed: the import below happens
 * in the browser after mount, in its own chunk). The chart follows its box's size, has no animation under reduced
 * motion, and is an image with a label for screen readers: the numbers are in the panel's table (Panel.tsx).
 */
export function EChart({ option, height, label }: { option: EChartsCoreOption; height: number; label: string }) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<EChartsType | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    let ro: ResizeObserver | null = null
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    import("./echarts-setup")
      .then(({ echarts }) => {
        if (!live || !el.current) return
        chart.current = echarts.init(el.current, null, { renderer: "svg" })
        chart.current.setOption({ ...base(reduced), ...option }, { notMerge: true })
        ro = new ResizeObserver(() => chart.current?.resize())
        ro.observe(el.current)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
      ro?.disconnect()
      chart.current?.dispose()
      chart.current = null
    }
    // The chart is made once; option changes go through the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- option is applied by the next effect
  }, [])
  useEffect(() => {
    if (!chart.current) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    chart.current.setOption({ ...base(reduced), ...option }, { notMerge: true })
  }, [option])
  if (failed) return null
  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />
}
