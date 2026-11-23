"use client"

import { useCallback, useEffect, useMemo, useState, type PointerEvent, type ReactNode } from "react"

export type Tip = { show: (e: PointerEvent<Element>, content: ReactNode) => void; hide: () => void }

/**
 * One Tablero 2 chart: an SVG as wide as its box (D3 computes, React draws), drawn once the box is measured, and a
 * tooltip that follows the pointer and stays inside the box. The SVG is an image with a label for screen readers; its
 * numbers are in the panel's "Ver tabla" (Panel.tsx).
 */
export function Frame({ height, label, children, square = false }: { height: number | ((w: number) => number); label: string; children: (w: number, tip: Tip) => ReactNode; square?: boolean }) {
  // The box as state (a callback ref): the tooltip reads its position in event handlers.
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const [w, setW] = useState(0)
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null)
  useEffect(() => {
    if (!box) return
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)))
    ro.observe(box)
    return () => ro.disconnect()
  }, [box])
  const show = useCallback((e: PointerEvent<Element>, content: ReactNode) => {
    const r = box?.getBoundingClientRect()
    if (!r) return
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, content })
  }, [box])
  const hide = useCallback(() => setTip(null), [])
  const tipApi = useMemo(() => ({ show, hide }), [show, hide])
  const h = typeof height === "function" ? height(w) : height
  const side = square ? Math.min(w, h) : w
  return (
    <div ref={setBox} className="relative w-full" style={{ height: square ? side || h : h }} onPointerLeave={hide}>
      {w > 0 && (
        <svg role="img" aria-label={label} width={square ? side : w} height={square ? side : h} viewBox={`0 0 ${square ? side : w} ${square ? side : h}`} className={`block overflow-visible ${square ? "mx-auto" : ""}`}>
          {children(square ? side : w, tipApi)}
        </svg>
      )}
      {tip && (
        <div
          role="presentation"
          className="pointer-events-none absolute z-10 w-max max-w-60 rounded-[10px] border border-white/12 bg-[#18181b]/95 px-2.5 py-2 text-xs text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,.45)] backdrop-blur"
          style={tip.x > w / 2 ? { left: tip.x - 14, top: Math.max(0, tip.y - 12), transform: "translateX(-100%)" } : { left: tip.x + 14, top: Math.max(0, tip.y - 12) }}
        >
          {tip.content}
        </div>
      )}
    </div>
  )
}

/** A tooltip's lines: a title, then label · value rows with an optional color key. */
export function TipBody({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="grid gap-1">
      <p className="font-medium text-zinc-50">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center justify-between gap-4 text-zinc-300">
          <span className="inline-flex items-center gap-1.5">
            {r.color && <span aria-hidden className="size-2 rounded-sm" style={{ background: r.color }} />}
            {r.label}
          </span>
          <b className="font-mono font-normal tabular-nums text-zinc-50">{r.value}</b>
        </p>
      ))}
    </div>
  )
}
