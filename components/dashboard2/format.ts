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
/**
 * A name cut to `n` characters that stays tellable apart from its neighbours: deployments share their first words
 * ("Edificio Demo Norte" / "Edificio Demo Sur"), so the last word is kept and the middle gives way ("Edifi… Norte").
 */
export const clipName = (s: string, n: number) => {
  const t = s.trim()
  if (t.length <= n) return t
  if (n < 4) return ""
  const last = t.split(/\s+/).at(-1) ?? ""
  if (last.length < t.length && last.length + 2 <= n) {
    const head = t.slice(0, n - last.length - 2).trimEnd()
    return head ? `${head}… ${last}` : `…${last}`
  }
  return `${t.slice(0, n - 1)}…`
}
