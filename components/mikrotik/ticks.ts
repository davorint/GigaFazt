/** Round axis step (1, 2, 2.5, 5 × 10^n) for about `target` ticks over `range`. */
export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(1, target)
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const f = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10
  return f * mag
}

/**
 * Categorical series colors for the page's dark surface (#09090b), in fixed
 * order: blue, orange, aqua, yellow, magenta, green. Checked with the dataviz
 * palette validator: all pass (lightness band, chroma, worst adjacent CVD ΔE
 * 8.4 ≥ 8, normal-vision ≥ 19.3, ≥ 3:1 contrast). Charts still carry a
 * legend, direct labels, surface gaps and a table, so identity is never
 * color alone.
 */
export const SERIES_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"] as const

/** Neutral for "your configuration" next to the categorical series. */
export const NEUTRAL_SERIES = "#e4e4e7"
