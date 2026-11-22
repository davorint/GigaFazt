"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { CopyButton } from "@/components/mikrotik/CopyButton"
import { SMALL } from "@/components/finance/FinParts"
import { useOltSettings } from "@/components/davorolt/useOltSettings"
import { agendaStore } from "@/lib/agenda/store"
import { localToday } from "@/lib/clients/from-lead"
import { saveClient } from "@/lib/clients/store"
import { TOOLS, run } from "@/lib/davorolt/tools"
import { mxn } from "@/lib/materials/catalog"
import { plans } from "@/lib/plans"
import { syncAndWait } from "@/lib/sync/engine"
import { readState } from "@/lib/sync/state"
import { buildAlta, emptyAlta, freeOntId, oltValues, problems, profileOf, sitePorts, suggestUser, type AltaInput, type AltaProblem } from "@/lib/wispdavor/alta"
import { fill, waNumber } from "@/lib/wispdavor/whatsapp"
import { useWispData } from "./useWispData"

type RouterRow = { id: string; name: string; siteId: string; pppoe: boolean }
type Step = { key: string; state: "ok" | "skip" | "fail"; detail?: string }
type Done = { steps: Step[]; clientId: string; olt: string; password: string; user: string; portal: string; welcome: string; phone: string }

const INPUT = "h-10 w-full rounded-lg border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100"
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const dayLabel = (d: string, time: string) =>
  `${new Date(`${d}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}${time ? ` a las ${time}` : ""}`

/** One form field: its label, the control (given its id and description ids), and hint / error below it (not in the label). */
function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string | null; children: (a: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode }) {
  const described = [hint ? `${id}-h` : "", error ? `${id}-e` : ""].filter(Boolean).join(" ") || undefined
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="text-xs text-zinc-400">
        {label}
      </label>
      {children({ id, ...(error ? { "aria-invalid": true as const } : {}), ...(described ? { "aria-describedby": described } : {}) })}
      {hint && (
        <span id={`${id}-h`} className="text-xs text-zinc-400">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-e`} className="text-xs text-red-300">
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * /interno/software/wispdavor/alta (phase 12): a new client in one step. The form, then what was done: client and
 * services, installation in Agenda, PPPoE user on the router (admins; password shown once), OLT commands, portal link
 * and welcome message (WhatsApp API, else a one-tap link).
 */
export function AltaApp() {
  const t = useTranslations("wispdavor.alta")
  const d = useWispData()
  const olt = useOltSettings()
  const agenda = useSyncExternalStore(agendaStore.subscribe, agendaStore.snapshot, agendaStore.serverSnapshot)
  const [f, setF] = useState<AltaInput>(emptyAlta)
  const [touched, setTouched] = useState(false)
  const [routers, setRouters] = useState<RouterRow[] | null>(null)
  const [routerId, setRouterId] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  const techs = useMemo(() => [...new Set(agenda.list.map((a) => a.who.trim()).filter(Boolean))].sort(), [agenda.list])
  const ports = useMemo(() => (f.siteId ? sitePorts(f.siteId, d.clients) : []), [f.siteId, d.clients])
  const set = (p: Partial<AltaInput>) => setF((x) => ({ ...x, ...p }))
  const loadRouters = async (siteId: string) => {
    try {
      const r = await fetch("/api/interno/routers?basico=1", { cache: "no-store" })
      const b = (await r.json()) as { routers?: RouterRow[] }
      const list = b.routers ?? []
      setRouters(list)
      setRouterId(list.find((x) => x.siteId === siteId && x.pppoe)?.id ?? "")
    } catch {
      setRouters([])
    }
  }
  if (!d.loaded) return null
  const errs = problems(f, d.clients)
  const show = (k: AltaProblem) => touched && errs.includes(k)
  const err = (...ks: AltaProblem[]) => {
    const k = ks.find(show)
    return k ? t(`problems.${k}`) : null
  }

  const submit = async () => {
    setTouched(true)
    if (errs.length) return
    setBusy(true)
    const by = readState().name || "Alta"
    const { client, appointment } = buildAlta(f, by)
    const steps: Step[] = []
    saveClient(client)
    steps.push({ key: "client", state: "ok", detail: client.name })
    agendaStore.save(appointment)
    steps.push({ key: "agenda", state: "ok", detail: dayLabel(f.date, f.time) })
    // The new records reach the server before the router action and the portal link refer to them.
    await syncAndWait().catch(() => false)
    let password = ""
    const internet = client.services[0]
    if (routerId) {
      const r = await fetch("/api/interno/routers", {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ action: "createUser", id: routerId, user: internet.pppoeUser, profile: internet.plan, clientId: client.id, serviceId: internet.id }),
      }).catch(() => null)
      const b = r ? ((await r.json().catch(() => ({}))) as { password?: string; error?: string }) : {}
      if (r?.ok && b.password) {
        password = b.password
        steps.push({ key: "router", state: "ok", detail: routers?.find((x) => x.id === routerId)?.name })
      } else steps.push({ key: "router", state: "fail", detail: t(b.error === "admin-only" ? "adminOnly" : "offline") })
    } else steps.push({ key: "router", state: "skip", detail: t("noRouter") })
    let oltCode = ""
    const values = oltValues(f, olt.settings.plans, password ? { user: internet.pppoeUser, pass: password } : null)
    const tool = TOOLS.find((x) => x.id === "preautorizar")
    const res = values && tool ? run(tool, values, olt.settings) : null
    if (res && "blocks" in res) {
      oltCode = res.blocks.map((b) => b.code).join("\n\n")
      steps.push({ key: "olt", state: "ok" })
    } else steps.push({ key: "olt", state: "skip", detail: t(values ? "oltSettings" : "oltMissing") })
    let portal = ""
    const pr = await fetch("/api/interno/portal", { method: "POST", headers: headers(), body: JSON.stringify({ clientId: client.id }) }).catch(() => null)
    const pb = pr ? ((await pr.json().catch(() => ({}))) as { link?: { token?: string } }) : {}
    if (pr?.ok && pb.link?.token) {
      portal = `${window.location.origin}/mi-cuenta#${pb.link.token}`
      steps.push({ key: "portal", state: "ok" })
    } else steps.push({ key: "portal", state: "fail", detail: t("offline") })
    const first = client.name.split(/\s+/)[0] ?? client.name
    const welcomeValues = [first, dayLabel(f.date, f.time), portal || `${window.location.origin}/clientes`]
    const phone = waNumber(client.whatsapp) ?? ""
    // Through the API only when WhatsApp is set up on the host; otherwise a one-tap link below.
    const configured = await fetch("/api/interno/whatsapp", { cache: "no-store" })
      .then(async (r) => (r.ok ? Boolean(((await r.json()) as { configured?: boolean }).configured) : false))
      .catch(() => false)
    const sent = configured
      ? await fetch("/api/interno/whatsapp", { method: "POST", headers: headers(), body: JSON.stringify({ template: "bienvenida", items: [{ clientId: client.id, phone: client.whatsapp, values: welcomeValues }] }) })
          .then(async (r) => (r.ok ? (((await r.json()) as { results?: { ok: boolean }[] }).results?.[0]?.ok ?? false) : false))
          .catch(() => false)
      : false
    steps.push({ key: "welcome", state: sent ? "ok" : "skip", detail: sent ? undefined : t("welcomeLink") })
    setDone({ steps, clientId: client.id, olt: oltCode, password, user: internet.pppoeUser, portal, welcome: sent ? "" : fill("bienvenida", welcomeValues), phone })
    setBusy(false)
  }

  if (done)
    return (
      <div className="mt-6 grid gap-6">
        <h2 className="text-lg font-light text-foreground">{t("doneTitle")}</h2>
        <ul className="grid gap-2">
          {done.steps.map((s) => (
            <li key={s.key} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span aria-hidden className={s.state === "ok" ? "text-emerald-300" : s.state === "fail" ? "text-red-300" : "text-amber-200"}>
                {s.state === "ok" ? "✓" : s.state === "fail" ? "✗" : "–"}
              </span>
              <span className="text-zinc-100">{t(`steps.${s.key}`)}</span>
              {s.detail && <span className="text-xs text-zinc-400">{s.detail}</span>}
            </li>
          ))}
        </ul>
        {done.password && (
          <section aria-labelledby="alta-pw" className="grid gap-1 rounded-xl border border-amber-300/40 p-3">
            <h3 id="alta-pw" className="text-sm text-amber-100">
              {t("passwordTitle")}
            </h3>
            <p className="font-mono text-sm text-zinc-100">
              {done.user} · {done.password}
            </p>
            <p className="text-xs text-zinc-400">{t("passwordHint")}</p>
          </section>
        )}
        {done.olt && (
          <section aria-labelledby="alta-olt" className="grid gap-2">
            <h3 id="alta-olt" className="text-sm text-zinc-200">
              {t("oltTitle")}
            </h3>
            <pre tabIndex={0} className="max-h-72 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-xs whitespace-pre text-zinc-100">
              {done.olt}
            </pre>
            <CopyButton text={done.olt} label={t("copy")} done={t("copied")} />
          </section>
        )}
        <div className="flex flex-wrap gap-2">
          {done.welcome && done.phone && (
            <a href={`https://wa.me/${done.phone}?text=${encodeURIComponent(done.welcome)}`} target="_blank" rel="noopener noreferrer" className={SMALL}>
              {t("sendWelcome")}
            </a>
          )}
          {done.portal && <CopyButton text={done.portal} label={t("copyPortal")} done={t("copied")} />}
          <a href={`/interno/admin/clientes?c=${done.clientId}`} className={SMALL}>
            {t("openClient")}
          </a>
          <button
            type="button"
            className={SMALL}
            onClick={() => {
              setDone(null)
              setF(emptyAlta())
              setTouched(false)
            }}
          >
            {t("another")}
          </button>
        </div>
      </div>
    )

  const plan = plans.find((p) => p.id === f.planId)
  return (
    <form
      className="mt-6 grid gap-6"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-base text-zinc-100">{t("who")}</legend>
        <Field id="alta-name" label={t("name")} error={err("name")}>
          {(a) => (
            <>
              <input {...a} className={INPUT} value={f.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => !f.pppoeUser && f.name && set({ pppoeUser: suggestUser(f.name, f.apartment, d.clients) })} autoComplete="off" />
            </>
          )}
        </Field>
        <Field id="alta-whatsapp" label={t("whatsapp")} error={err("whatsapp")}>
          {(a) => (
            <>
              <input {...a} className={INPUT} inputMode="tel" value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} autoComplete="off" />
            </>
          )}
        </Field>
        <Field id="alta-site" label={t("site")} error={err("site")}>
          {(a) => (
            <>
              <select {...a}
                className={INPUT}
                value={f.siteId}
                onChange={(e) => {
                  const s = d.sites.find((x) => x.id === e.target.value)
                  set({ siteId: e.target.value, building: s?.name ?? f.building, oltPort: "", ontId: "" })
                  void loadRouters(e.target.value)
                }}
              >
                <option value="">{t("pick")}</option>
                {d.sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="alta-tower" label={t("tower")}>
            {(a) => (
              <>
                <input {...a} className={INPUT} value={f.tower} onChange={(e) => set({ tower: e.target.value })} />
              </>
            )}
          </Field>
          <Field id="alta-apartment" label={t("apartment")}>
            {(a) => (
              <>
                <input {...a} className={INPUT} value={f.apartment} onChange={(e) => set({ apartment: e.target.value })} onBlur={() => f.name && set({ pppoeUser: suggestUser(f.name, f.apartment, d.clients) })} />
              </>
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="mb-2 text-base text-zinc-100">{t("planTitle")}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {plans.map((p) => (
            <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${f.planId === p.id ? "border-white/50" : "border-white/10"}`}>
              <input type="radio" name="plan" className="accent-white" checked={f.planId === p.id} onChange={() => set({ planId: p.id })} />
              <span className="text-zinc-100">{profileOf(p)}</span>
              {typeof p.priceMxn === "number" && <span className="font-mono text-xs text-zinc-400">{t("perMonth", { amount: mxn(p.priceMxn) })}</span>}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-100">
          <input type="checkbox" className="size-5 accent-white" checked={f.tv} onChange={(e) => set({ tv: e.target.checked })} />
          {t("tv")}
        </label>
        {plan && <p className="text-xs text-zinc-400">{t("billing")}</p>}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-base text-zinc-100">{t("installTitle")}</legend>
        <Field id="alta-date" label={t("date")} error={err("date")}>
          {(a) => (
            <>
              <input {...a} type="date" className={INPUT} min={localToday()} value={f.date} onChange={(e) => set({ date: e.target.value })} />
            </>
          )}
        </Field>
        <Field id="alta-time" label={t("time")}>
          {(a) => (
            <>
              <input {...a} type="time" className={INPUT} value={f.time} onChange={(e) => set({ time: e.target.value })} />
            </>
          )}
        </Field>
        <Field id="alta-tech" label={t("tech")}>
          {(a) => (
            <>
              <input {...a} className={INPUT} list="alta-techs" value={f.who} onChange={(e) => set({ who: e.target.value })} />
              <datalist id="alta-techs">
                {techs.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </>
          )}
        </Field>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-base text-zinc-100">{t("netTitle")}</legend>
        <Field id="alta-router" label={t("router")}>
          {(a) => (
            <>
              <select {...a} className={INPUT} value={routerId} onChange={(e) => setRouterId(e.target.value)} disabled={!routers}>
                <option value="">{routers ? t("noRouterOption") : t("pickSiteFirst")}</option>
                {(routers ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                    {r.siteId === f.siteId ? ` · ${t("thisSite")}` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
        </Field>
        <Field id="alta-user" label={t("user")} error={err("user", "userTaken")}>
          {(a) => (
            <>
              <input {...a} className={`${INPUT} font-mono`} value={f.pppoeUser} onChange={(e) => set({ pppoeUser: e.target.value })} autoComplete="off" spellCheck={false} />
            </>
          )}
        </Field>
        <Field id="alta-ontModel" label={t("ontModel")}>
          {(a) => (
            <>
              <input {...a} className={INPUT} value={f.ontModel} onChange={(e) => set({ ontModel: e.target.value })} />
            </>
          )}
        </Field>
        <Field id="alta-ontSn" label={t("ontSn")} hint={t("ontSnHint")} error={err("snTaken")}>
          {(a) => (
            <>
              <input {...a} className={`${INPUT} font-mono uppercase`} value={f.ontSn} onChange={(e) => set({ ontSn: e.target.value })} autoComplete="off" spellCheck={false} />
            </>
          )}
        </Field>
        <Field id="alta-oltPort" label={t("oltPort")} error={err("port")}>
          {(a) => (
            <>
              <input
                {...a}
                className={`${INPUT} font-mono`}
                list="alta-ports"
                value={f.oltPort}
                placeholder="0/1/0"
                onChange={(e) => set({ oltPort: e.target.value, ontId: freeOntId(e.target.value, d.clients) })}
              />
              <datalist id="alta-ports">
                {ports.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </>
          )}
        </Field>
        <Field id="alta-ontId" label={t("ontId")} hint={t("ontIdHint")} error={err("ontId", "idTaken")}>
          {(a) => (
            <>
              <input {...a} className={`${INPUT} font-mono`} inputMode="numeric" value={f.ontId} onChange={(e) => set({ ontId: e.target.value })} />
            </>
          )}
        </Field>
      </fieldset>

      {touched && errs.length > 0 && (
        <p role="alert" className="text-sm text-red-300">
          {t("fix", { n: errs.length })}
        </p>
      )}
      <button type="submit" disabled={busy} className="inline-flex min-h-11 w-fit items-center rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 disabled:opacity-50">
        {busy ? t("working") : t("submit")}
      </button>
    </form>
  )
}
