/** Number formatting for the burst tool (es-MX: comma groups, dot decimals). */

const nf = (max: number) => new Intl.NumberFormat("es-MX", { maximumFractionDigits: max })
const N0 = nf(0)
const N1 = nf(1)
const N2 = nf(2)

export function fmtNum(n: number, maxDecimals = 1): string {
  if (n === Number.POSITIVE_INFINITY) return "∞"
  return (maxDecimals <= 0 ? N0 : maxDecimals === 1 ? N1 : N2).format(n)
}

/** "500 Mbps", "1,000 Mbps", "12.5 Gbps" (Gbps from 10,000 Mbps up). */
export function fmtRate(mbps: number): string {
  if (mbps === Number.POSITIVE_INFINITY) return "∞"
  if (mbps >= 10_000) return `${fmtNum(mbps / 1000, 2)} Gbps`
  return `${fmtNum(mbps, mbps < 10 ? 2 : 1)} Mbps`
}

/** Megabits → "375 MB" / "4.69 GB". */
export function fmtData(megabits: number): string {
  if (megabits === Number.POSITIVE_INFINITY) return "∞"
  const mb = megabits / 8
  if (mb >= 1000) return `${fmtNum(mb / 1000, 2)} GB`
  return `${fmtNum(mb, mb < 10 ? 2 : 0)} MB`
}

/** Seconds → "6 s", "0.25 s", "∞". */
export function fmtSec(s: number): string {
  if (s === Number.POSITIVE_INFINITY) return "∞"
  return `${fmtNum(s, s < 1 ? 2 : 1)} s`
}

/** 0.75 → "75 %". */
export function fmtPct(ratio: number): string {
  return `${fmtNum(ratio * 100, ratio * 100 < 10 ? 1 : 0)} %`
}
