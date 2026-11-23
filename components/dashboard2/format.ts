/** Tablero 2's number and date formats (es-MX). */
export const short = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "short", year: "2-digit" })
export const monthName = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "long" })
export const k = (n: number) => {
  const a = Math.abs(n)
  const v = a >= 1000 ? `$${(a / 1000).toLocaleString("es-MX", { maximumFractionDigits: 1 })}k` : `$${Math.round(a)}`
  return n < 0 ? `−${v}` : v
}
export const pct = (x: number | null, digits = 0) => (x === null ? "—" : `${(x * 100).toLocaleString("es-MX", { maximumFractionDigits: digits })} %`)
/** Whole pesos for headline figures ($87,040); tables keep cents. */
export const pesos = (n: number) => `${n < 0 ? "−" : ""}$${Math.round(Math.abs(n)).toLocaleString("es-MX")}`
export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0")
