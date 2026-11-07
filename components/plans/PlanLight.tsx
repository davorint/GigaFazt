/**
 * The plan card's "light chamber": rails of light whose count, brightness and
 * packet speed scale with the plan's speed, so tiers read at a glance. Even
 * rails carry download (cyan, →), odd ones upload (violet, ←): equal counts
 * because every plan is symmetrical. Deterministic (no random) for SSR.
 *
 * Packets move with `transform` only (compositor, no repaint), on a full-width
 * track per rail. They pause offscreen (.plan-card without data-inview) and
 * stop under reduced motion / paused animations via the global rules, resting
 * at spread-out positions (inline transform; animation fill-mode is none).
 */
export function PlanLight({ ratio }: { ratio: number }) {
  const n = Math.max(2, Math.round((12 * ratio) / 2) * 2)
  const base = 0.28 + 0.42 * ratio
  const duration = 3.6 - 2.2 * ratio
  const rails = Array.from({ length: n }, (_, i) => ({ i, up: i % 2 === 1, top: 12 + ((i + 0.5) * 76) / n }))

  return (
    <div aria-hidden className="absolute inset-0">
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(70% 90% at 50% 50%, rgb(34 211 238 / ${(0.03 + 0.17 * ratio).toFixed(3)}), transparent 70%)` }}
      />
      {rails.map((r) => (
        <div key={r.i} className="absolute inset-x-0" style={{ top: `${r.top}%` }}>
          <div
            className="h-px w-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${r.up ? "rgb(167 139 250" : "rgb(34 211 238"} / ${base.toFixed(2)}) 15%, ${r.up ? "rgb(167 139 250" : "rgb(34 211 238"} / ${base.toFixed(2)}) 85%, transparent)`,
            }}
          />
          <div
            className={r.up ? "plan-packet plan-packet-up" : "plan-packet"}
            style={{
              transform: `translateX(${((r.i * 37) % 100) - 10}%)`,
              animationDuration: `${duration.toFixed(2)}s`,
              animationDelay: `${(-r.i * 0.41).toFixed(2)}s`,
            }}
          >
            <span className={r.up ? "plan-packet-dot bg-violet-200 shadow-[0_0_8px_2px_rgb(167_139_250/0.8)]" : "plan-packet-dot bg-cyan-100 shadow-[0_0_8px_2px_rgb(34_211_238/0.8)]"} />
          </div>
        </div>
      ))}
    </div>
  )
}
