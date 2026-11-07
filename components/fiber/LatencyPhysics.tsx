"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Slider } from "@/components/ui/slider"
import { fiberRttMs } from "@/lib/fiber-math"

/** Typical access-network overheads (ms), approximate industry references. */
const FTTH_MS = 2
const CABLE_MS = 10
const WIRELESS_MS = 35
const MAX_KM = 500
const SCALE_MS = WIRELESS_MS + fiberRttMs(MAX_KM)

/**
 * LatencyPhysics (SPEC §4): a distance slider showing fiber propagation
 * (~5 µs/km, round trip) vs the typical extra delay of cable and 4G access.
 * No animation: bars resize instantly. Lazy-loaded by LazyLatencyPhysics.
 */
export default function LatencyPhysics() {
  const t = useTranslations("fiber.physics")
  const [km, setKm] = useState(50)
  const fiber = fiberRttMs(km)

  const rows = [
    { key: "fiber", ms: fiber + FTTH_MS, accent: true },
    { key: "cable", ms: fiber + CABLE_MS, accent: false },
    { key: "wireless", ms: fiber + WIRELESS_MS, accent: false },
  ] as const

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="text-xl font-semibold tracking-[-0.02em]">{t("title")}</h3>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("desc")}</p>

      <div className="mt-6">
        <div className="mb-3 flex items-baseline justify-between font-mono text-xs">
          <span id="physics-distance" className="uppercase tracking-wider text-muted-foreground">
            {t("distance")}
          </span>
          <span className="text-lg text-foreground">{km} km</span>
        </div>
        <Slider
          aria-labelledby="physics-distance"
          min={1}
          max={MAX_KM}
          step={1}
          value={[km]}
          format={{ style: "unit", unit: "kilometer" }}
          onValueChange={(v) => setKm(Array.isArray(v) ? v[0] : v)}
        />
      </div>

      <p className="mt-4 font-mono text-xs text-muted-foreground">
        {t("propagation")}: <span className="whitespace-nowrap text-fiber">{fiber.toFixed(2)} ms</span>
      </p>

      <ul className="mt-4 space-y-4">
        {rows.map((r) => (
          <li key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={r.accent ? "text-foreground" : "text-muted-foreground"}>{t(r.key)}</span>
              <span className={`shrink-0 whitespace-nowrap font-mono ${r.accent ? "text-fiber" : "text-foreground"}`}>
                {r.ms < 10 ? r.ms.toFixed(2) : r.ms.toFixed(1)} ms
              </span>
            </div>
            <span aria-hidden className="mt-1.5 block h-1.5 rounded-full bg-muted">
              <span
                className={`block h-full rounded-full ${r.accent ? "bg-fiber shadow-[0_0_8px_var(--color-fiber)]" : "bg-muted-foreground/50"}`}
                style={{ width: `${Math.max(0.8, (r.ms / SCALE_MS) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 font-mono text-[0.7rem] leading-relaxed text-muted-foreground">{t("note")}</p>
    </div>
  )
}
