/**
 * Common-area Wi-Fi vouchers (WispDavor phase 3, owner 2026-11-21: plans and prices set in WispDavor; the hotspot runs
 * on a deployment's router or on a router of its own). A plan is a MikroTik hotspot user profile (its speed) plus the
 * voucher's limits (time and/or data); each voucher is a hotspot user the router adds by itself (lib/wispdavor/routers.ts).
 */
import { randomCode, safe, uptimeLimit } from "./routers"

export type VoucherPlan = { id: string; name: string; minutes: number; mb: number; rate: string; price: number | null; active: boolean }

/** RouterOS rate-limit "rx/tx" (upload/download), e.g. "5M/10M"; "" = no limit. */
export const RATE = /^(\d{1,5}[kKM]?)\/(\d{1,5}[kKM]?)$/

export function decodePlans(v: unknown): VoucherPlan[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .slice(0, 30)
    .map((x) => ({
      id: typeof x.id === "string" && /^[a-z0-9]{4,12}$/.test(x.id) ? x.id : randomCode(6),
      name: typeof x.name === "string" ? x.name.slice(0, 40) : "",
      minutes: typeof x.minutes === "number" && x.minutes >= 0 ? Math.min(Math.round(x.minutes), 525600) : 0,
      mb: typeof x.mb === "number" && x.mb >= 0 ? Math.min(Math.round(x.mb), 10_000_000) : 0,
      rate: typeof x.rate === "string" && RATE.test(x.rate.trim()) ? x.rate.trim() : "",
      price: typeof x.price === "number" && x.price >= 0 ? Math.round(x.price * 100) / 100 : null,
      active: x.active !== false,
    }))
    .filter((p) => p.name.trim())
}

/** The hotspot user profile on the router for a plan. */
export const profileOf = (p: Pick<VoucherPlan, "id">) => `WD-${p.id}`

export const planIssues = (p: VoucherPlan) => [!p.name.trim() && "name", p.minutes <= 0 && p.mb <= 0 && "limit", p.rate && !RATE.test(p.rate) && "rate"].filter((x): x is string => !!x)

export type NewVoucher = { code: string; password: string }

/** `count` new vouchers (codes not in `taken`): 8-character user and 6-character password, unambiguous characters. */
export function newVouchers(count: number, taken: Set<string>, rand?: (n: number) => number): NewVoucher[] {
  const out: NewVoucher[] = []
  while (out.length < Math.min(count, 200)) {
    const code = randomCode(8, rand)
    if (taken.has(code) || out.some((v) => v.code === code)) continue
    out.push({ code, password: randomCode(6, rand) })
  }
  return out
}

/** The actions that put a plan's profile and its vouchers on the router. */
export function voucherActions(p: VoucherPlan, vs: NewVoucher[]) {
  const profile = profileOf(p)
  const rate = p.rate || "0/0"
  const ok = [profile, rate, ...vs.flatMap((v) => [v.code, v.password])].every(safe)
  if (!ok) return null
  return [
    { kind: "hsprofile" as const, user: profile, arg1: rate, arg2: "", arg3: "", arg4: "" },
    ...vs.map((v) => ({ kind: "voucher" as const, user: v.code, arg1: profile, arg2: v.password, arg3: uptimeLimit(p.minutes), arg4: String(p.mb * 1024 * 1024) })),
  ]
}
