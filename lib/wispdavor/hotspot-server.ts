/** Hotspot voucher plans (in wisp_settings) and vouchers (table `vouchers`) on the server. Server code only. */
import "server-only"
import { getPool } from "../db/client"
import { decodePlans, newVouchers, voucherActions, type VoucherPlan } from "./hotspot"
import { queueAction } from "./routers-server"

const KEY = "hotspot"

export async function getPlans(): Promise<VoucherPlan[]> {
  const r = (await getPool().query(`select value from wisp_settings where key = $1`, [KEY])).rows[0] as { value: unknown } | undefined
  return decodePlans(r?.value ?? [])
}

export async function savePlans(plans: VoucherPlan[], by: string) {
  await getPool().query(
    `insert into wisp_settings (key, value, updated_by) values ($1, $2, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [KEY, JSON.stringify(decodePlans(plans)), by]
  )
}

/** Creates `count` vouchers of a plan for a hotspot router and queues them (the plan's profile first). */
export async function createVouchers(routerId: string, planId: string, count: number, by: string): Promise<{ codes: string[] } | { error: string }> {
  const pool = getPool()
  const router = (await pool.query(`select hotspot from routers where id = $1`, [routerId])).rows[0] as { hotspot: boolean } | undefined
  if (!router?.hotspot) return { error: "router" }
  const plan = (await getPlans()).find((p) => p.id === planId && p.active)
  if (!plan) return { error: "plan" }
  const taken = new Set(((await pool.query(`select code from vouchers`)).rows as { code: string }[]).map((x) => x.code))
  const vs = newVouchers(Math.max(1, Math.min(count, 200)), taken)
  const actions = voucherActions(plan, vs)
  if (!actions) return { error: "plan" }
  for (const v of vs)
    await pool.query(`insert into vouchers (code, password, router_id, plan_id, plan_name, price, created_by) values ($1, $2, $3, $4, $5, $6, $7)`, [v.code, v.password, routerId, plan.id, plan.name, plan.price, by])
  for (const a of actions) await queueAction(routerId, a, { by })
  return { codes: vs.map((v) => v.code) }
}

export async function listVouchers(limit = 500) {
  return (await getPool().query(`select code, password, router_id, plan_id, plan_name, price, status, uptime, bytes, created_at, sold_at from vouchers order by created_at desc limit $1`, [limit])).rows
}

export async function markSold(code: string, sold: boolean) {
  await getPool().query(`update vouchers set sold_at = ${sold ? "now()" : "null"} where code = $1`, [code])
}
