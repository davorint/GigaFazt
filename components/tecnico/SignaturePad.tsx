"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The client signs with a finger: strokes on a white canvas (prints and photocopies clean), exported as PNG. Pointer
 * events cover touch, pen and mouse; the page doesn't scroll while signing (touch-action: none).
 */
export function SignaturePad({ label, clearLabel, onChange }: { label: string; clearLabel: string; onChange: (png: Blob | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    // The bitmap matches the box on screen (sharp lines on any phone).
    const scale = window.devicePixelRatio || 1
    c.width = Math.round(c.clientWidth * scale)
    c.height = Math.round(c.clientHeight * scale)
    const g = c.getContext("2d")
    if (!g) return
    g.scale(scale, scale)
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, c.width, c.height)
    g.lineWidth = 2.5
    g.lineCap = "round"
    g.lineJoin = "round"
    g.strokeStyle = "#111111"
  }, [])
  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return [e.clientX - box.left, e.clientY - box.top] as const
  }
  const finish = () => {
    if (!drawing.current) return
    drawing.current = false
    ref.current?.toBlob((b) => onChange(b), "image/png")
  }
  const clear = () => {
    const c = ref.current
    const g = c?.getContext("2d")
    if (!c || !g) return
    g.save()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.fillStyle = "#ffffff"
    g.fillRect(0, 0, c.width, c.height)
    g.restore()
    setEmpty(true)
    onChange(null)
  }
  return (
    <div className="grid gap-2">
      <canvas
        ref={ref}
        role="img"
        aria-label={label}
        className="h-40 w-full touch-none rounded-lg border border-white/20 bg-white"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          drawing.current = true
          setEmpty(false)
          const g = e.currentTarget.getContext("2d")
          const [x, y] = at(e)
          g?.beginPath()
          g?.moveTo(x, y)
          g?.lineTo(x + 0.1, y + 0.1)
          g?.stroke()
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const g = e.currentTarget.getContext("2d")
          const [x, y] = at(e)
          g?.lineTo(x, y)
          g?.stroke()
        }}
        onPointerUp={finish}
        onPointerCancel={finish}
      />
      {!empty && (
        <button type="button" onClick={clear} className="inline-flex min-h-9 w-fit items-center rounded-full border border-white/15 px-3 text-xs text-zinc-200 hover:bg-white/5">
          {clearLabel}
        </button>
      )}
    </div>
  )
}
