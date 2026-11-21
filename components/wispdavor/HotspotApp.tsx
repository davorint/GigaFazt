"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import { PickField } from "@/components/surveys/SurveyFields"
import { DANGER, PRIMARY, SMALL } from "@/components/finance/FinParts"
import { mxn } from "@/lib/materials/catalog"
import { readState } from "@/lib/sync/state"
import { planIssues, type VoucherPlan } from "@/lib/wispdavor/hotspot"
import { randomCode } from "@/lib/wispdavor/routers"

type Voucher = { code: string; password: string; router_id: string; plan_id: string; plan_name: string; price: number | null; status: string; uptime: string; bytes: string; created_at: string; sold_at: string | null }
type Data = { plans: VoucherPlan[]; vouchers: Voucher[]; routers: { id: string; name: string }[] }
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

/** /interno/software/wispdavor/hotspot: voucher plans (owner's prices), creating vouchers on a hotspot router, printing. */
export function HotspotApp() {
  const t = useTranslations("wispdavor.hotspot")
  const [data, setData] = useState<Data | null>(null)
  const [plans, setPlans] = useState<VoucherPlan[]>([])
  const [error, setError] = useState(false)
  const [msg, setMsg] = useState("")
  const [gen, setGen] = useState({ routerId: "", planId: "", count: "10" })
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/hotspot", { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      const b = (await r.json()) as Data
      setData(b)
      setPlans(b.plans)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the plans and vouchers once from the server when the page opens
    void load()
  }, [load])
  const setPlan = (i: number, p: Partial<VoucherPlan>) => setPlans((ps) => ps.map((x, k) => (k === i ? { ...x, ...p } : x)))
  const num = (v: string) => (v.trim() === "" ? 0 : Math.max(0, Number(v.replace(",", ".")) || 0))
  const save = async () => {
    const r = await fetch("/api/interno/hotspot", { method: "PUT", headers: headers(), body: JSON.stringify({ plans }) }).catch(() => null)
    setMsg(r?.ok ? t("saved") : t("error"))
    if (r?.ok) await load()
  }
  const generate = async () => {
    const r = await fetch("/api/interno/hotspot", { method: "POST", headers: headers(), body: JSON.stringify({ action: "generate", routerId: gen.routerId, planId: gen.planId, count: Number(gen.count) || 1 }) }).catch(() => null)
    const b = r ? ((await r.json().catch(() => ({}))) as { codes?: string[] }) : {}
    setMsg(r?.ok && b.codes ? t("created", { n: b.codes.length }) : t("error"))
    if (r?.ok) await load()
  }
  const sold = async (code: string, value: boolean) => {
    await fetch("/api/interno/hotspot", { method: "POST", headers: headers(), body: JSON.stringify({ action: "sold", code, sold: value }) }).catch(() => null)
    await load()
  }
  /** The unsold, unused vouchers as printable cards in a window of their own. */
  const print = () => {
    const list = (data?.vouchers ?? []).filter((v) => !v.sold_at && v.status !== "used")
    const w = window.open("", "_blank")
    if (!w) return
    const cards = list
      .map(
        (v) =>
          `<div class="c"><b>${esc(t("cardTitle"))}</b><span>${esc(v.plan_name)}${v.price !== null ? ` · ${esc(mxn(v.price))}` : ""}</span><span>${esc(t("user"))}: <code>${esc(v.code)}</code></span><span>${esc(t("pass"))}: <code>${esc(v.password)}</code></span></div>`
      )
      .join("")
    w.document.write(
      `<!doctype html><html lang="es"><meta charset="utf-8"><title>${esc(t("print"))}</title><style>body{font:14px system-ui,sans-serif;margin:12mm}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}.c{border:1px dashed #555;border-radius:3mm;padding:4mm;display:grid;gap:1.5mm;break-inside:avoid}code{font:15px ui-monospace,monospace;letter-spacing:.05em}</style><div class="g">${cards}</div><script>print()</script></html>`
    )
    w.document.close()
  }
  return (
    <div className="mt-6 grid gap-8">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {error && <p className="text-xs text-amber-200">{t("error")}</p>}
      {msg && (
        <p role="status" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-100">
          {msg}
        </p>
      )}
      <section aria-labelledby="wd-hs-plans" className="grid gap-3 rounded-2xl border border-white/10 p-4">
        <h2 id="wd-hs-plans" className="text-lg font-light text-foreground">
          {t("plans")}
        </h2>
        {plans.map((p, i) => {
          const issues = planIssues(p)
          return (
            <div key={p.id} className="grid gap-2 border-b border-white/5 pb-3">
              <div className="grid items-start gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <TextField label={t("planName")} value={p.name} onChange={(name) => setPlan(i, { name: name.slice(0, 40) })} />
                <TextField label={t("minutes")} value={String(p.minutes || "")} onChange={(v) => setPlan(i, { minutes: Math.round(num(v)) })} />
                <TextField label={t("mb")} value={String(p.mb || "")} onChange={(v) => setPlan(i, { mb: Math.round(num(v)) })} />
                <TextField label={t("rate")} value={p.rate} onChange={(rate) => setPlan(i, { rate: rate.trim() })} />
                <TextField label={t("price")} value={p.price === null ? "" : String(p.price)} onChange={(v) => setPlan(i, { price: v.trim() === "" ? null : num(v) })} />
                <label className="flex min-h-10 items-center gap-2 self-end text-sm text-zinc-200">
                  <input type="checkbox" checked={p.active} onChange={(e) => setPlan(i, { active: e.target.checked })} className="size-5 accent-white" />
                  {t("active")}
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {issues.length > 0 && <span className="text-xs text-amber-200">{issues.map((x) => t(`planIssues.${x}`)).join(" · ")}</span>}
                <button type="button" onClick={() => setPlans((ps) => ps.filter((_, k) => k !== i))} className={DANGER}>
                  {t("removePlan")}
                </button>
              </div>
            </div>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setPlans((ps) => [...ps, { id: randomCode(6), name: "", minutes: 0, mb: 0, rate: "", price: null, active: true }])} className={SMALL}>
            {t("addPlan")}
          </button>
          <button type="button" onClick={save} className={PRIMARY}>
            {t("savePlans")}
          </button>
        </div>
      </section>
      <section aria-labelledby="wd-hs-gen" className="grid gap-3 rounded-2xl border border-white/10 p-4">
        <h2 id="wd-hs-gen" className="text-lg font-light text-foreground">
          {t("generate")}
        </h2>
        {data && !data.routers.length ? (
          <p className="text-sm text-amber-200">{t("noRouter")}</p>
        ) : (
          <>
            <div className="grid items-start gap-3 sm:grid-cols-3">
              <PickField label={t("router")} value={gen.routerId} onChange={(routerId) => setGen((g) => ({ ...g, routerId }))} options={[{ value: "", label: "—" }, ...(data?.routers ?? []).map((r) => ({ value: r.id, label: r.name }))]} />
              <PickField label={t("plan")} value={gen.planId} onChange={(planId) => setGen((g) => ({ ...g, planId }))} options={[{ value: "", label: "—" }, ...(data?.plans ?? []).filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]} />
              <TextField label={t("count")} value={gen.count} onChange={(count) => setGen((g) => ({ ...g, count: count.replace(/\D/g, "").slice(0, 3) }))} />
            </div>
            <button type="button" disabled={!gen.routerId || !gen.planId} onClick={generate} className={`${PRIMARY} disabled:opacity-40`}>
              {t("generate")}
            </button>
          </>
        )}
      </section>
      <section aria-labelledby="wd-hs-list" className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="wd-hs-list" className="text-xl font-light text-foreground">
            {t("vouchers")}
          </h2>
          {!!data?.vouchers.length && (
            <button type="button" onClick={print} className={SMALL}>
              {t("print")}
            </button>
          )}
        </div>
        {data && !data.vouchers.length && <p className="text-sm text-zinc-400">{t("none")}</p>}
        <ul className="grid gap-1.5">
          {data?.vouchers.map((v) => (
            <li key={v.code} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <span className="font-mono text-xs text-zinc-200">
                {v.code} / {v.password} · {v.plan_name}
                {v.price !== null ? ` · ${mxn(v.price)}` : ""} · {t.has(`statuses.${v.status}`) ? t(`statuses.${v.status}`) : v.status}
                {v.uptime ? ` · ${v.uptime}` : ""}
              </span>
              <label className="flex min-h-9 items-center gap-2 text-xs text-zinc-300">
                <input type="checkbox" checked={!!v.sold_at} onChange={(e) => sold(v.code, e.target.checked)} className="size-4 accent-white" />
                {t("sold")}
              </label>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
