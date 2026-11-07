/** Number/unit formatting shared by plan UI. Pure, locale-aware, no data. */

export function formatSpeed(mbps: number): { value: string; unit: "Mbps" | "Gbps" } {
  if (mbps >= 1000) {
    const g = mbps / 1000
    return { value: Number.isInteger(g) ? String(g) : g.toFixed(1), unit: "Gbps" }
  }
  return { value: String(mbps), unit: "Mbps" }
}

/** "1 Gbps", or a range "1–100 Gbps" for dedicated tiers. */
export function speedLabel(mbps: number, maxMbps?: number): string {
  const a = formatSpeed(mbps)
  if (!maxMbps) return `${a.value} ${a.unit}`
  const b = formatSpeed(maxMbps)
  return a.unit === b.unit
    ? `${a.value}–${b.value} ${b.unit}`
    : `${a.value} ${a.unit}–${b.value} ${b.unit}`
}

/** Clock hour for display: "8:00" / "18:00" in Spanish, "8 AM" / "6 PM" in English. */
export function hourLabel(hour: number, locale: string): string {
  if (locale.startsWith("es")) return `${hour}:00`
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" }).format(Date.UTC(2020, 0, 1, hour))
}

export function formatMxn(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "es-MX", {
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(iso: string, locale: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d)
}

/** Install fee display: 0 → the localized "free" label, else "$1,234". */
export function feeLabel(fee: number, locale: string, free: string): string {
  return fee === 0 ? free : `$${formatMxn(fee, locale)}`
}
