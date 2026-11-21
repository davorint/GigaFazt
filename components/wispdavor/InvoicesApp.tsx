"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { TextField } from "@/components/mikrotik/TextField"
import { PickField } from "@/components/surveys/SurveyFields"
import { DANGER, PRIMARY, SMALL } from "@/components/finance/FinParts"
import { localToday } from "@/lib/clients/from-lead"
import { clientLabel, type Client, type Fiscal } from "@/lib/clients/model"
import { saveClient } from "@/lib/clients/store"
import { mxn } from "@/lib/materials/catalog"
import { readState } from "@/lib/sync/state"
import { DEFAULT_CFDI, REGIMES, USES, fiscalIssues, settingsReady, type CfdiSettings } from "@/lib/wispdavor/cfdi"
import { useWispData } from "./useWispData"

type T = ReturnType<typeof useTranslations>
type Cfdi = { id: string; client_id: string; payment_id: string; uuid: string; serie: string; folio: string; total: number; receiver_rfc: string; status: string; created_at: string }
type Data = { configured: { facturama: boolean; sandbox: boolean }; settings: CfdiSettings; cfdis: Cfdi[] }

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })
const plusDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}

/** /interno/software/wispdavor/facturas: CFDI settings, clients' fiscal data, payments to invoice and issued CFDIs. */
export function InvoicesApp() {
  const t = useTranslations("wispdavor.facturas")
  const d = useWispData()
  const [data, setData] = useState<Data | null>(null)
  const [msg, setMsg] = useState("")
  const [busy, setBusy] = useState("")
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/interno/facturas", { cache: "no-store" })
      if (!r.ok) throw new Error(String(r.status))
      setData((await r.json()) as Data)
    } catch {
      setMsg(t("errors.offline"))
    }
  }, [t])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads the invoices once from the server when the page opens
    void load()
  }, [load])
  if (!d.loaded) return null
  const today = localToday()
  const errText = async (r: Response) => {
    const b = (await r.json().catch(() => ({}))) as { error?: string; detail?: string }
    const k = b.error ?? "server"
    return t.has(`errors.${k}`) ? t(`errors.${k}`, { detail: b.detail ?? "" }) : k
  }
  const action = async (key: string, body: object, ok: string) => {
    setBusy(key)
    setMsg("")
    try {
      const r = await fetch("/api/interno/facturas", { method: "POST", headers: headers(), body: JSON.stringify(body) })
      setMsg(r.ok ? ok : await errText(r))
      if (r.ok) await load()
    } catch {
      setMsg(t("errors.offline"))
    }
    setBusy("")
  }
  const ready = (c: Client) => fiscalIssues(c.fiscal).length === 0
  const invoiced = new Set((data?.cfdis ?? []).filter((x) => x.status === "active").map((x) => x.payment_id))
  const since = plusDays(today, -90)
  const toInvoice = d.payments
    .filter((p) => p.date >= since && !invoiced.has(p.id))
    .map((p) => ({ p, c: d.clients.find((c) => c.id === p.clientId) }))
    .filter((x): x is { p: (typeof d.payments)[number]; c: Client } => !!x.c && ready(x.c))
    .sort((a, b) => b.p.date.localeCompare(a.p.date))
  const name = (id: string) => {
    const c = d.clients.find((x) => x.id === id)
    return c ? clientLabel(c) : id.slice(0, 8)
  }
  const canIssue = !!data?.configured.facturama && !!data && settingsReady(data.settings)
  return (
    <div className="mt-6 grid gap-10">
      <p className="text-sm text-zinc-300">{t("lead")}</p>
      {data && (
        <p className={`text-xs ${data.configured.facturama ? "text-emerald-300" : "text-amber-200"}`}>
          {data.configured.facturama ? t("status.on") : t("status.off")}
          {data.configured.sandbox ? ` · ${t("status.sandbox")}` : ""}
        </p>
      )}
      {msg && (
        <p role="status" className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-100">
          {msg}
        </p>
      )}
      {data && <SettingsForm t={t} initial={data.settings} onSaved={load} />}
      <FiscalEditor t={t} clients={d.clients} />
      <section aria-labelledby="wd-to-invoice" className="grid gap-2">
        <h2 id="wd-to-invoice" className="text-xl font-light text-foreground">
          {t("toInvoice")}
        </h2>
        {!toInvoice.length && <p className="text-sm text-zinc-400">{t("toInvoiceNone")}</p>}
        <ul className="grid gap-1.5">
          {toInvoice.map(({ p, c }) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <span className="text-zinc-100">
                {clientLabel(c)} <span className="font-mono text-xs text-zinc-400">{`${c.fiscal.rfc} · ${p.date} · ${mxn(p.amount)} · ${p.method}`}</span>
              </span>
              <button type="button" disabled={!canIssue || busy === p.id} onClick={() => action(p.id, { action: "issue", paymentId: p.id }, t("issue"))} className={`${SMALL} disabled:opacity-40`}>
                {busy === p.id ? t("issuing") : t("issue")}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="wd-issued" className="grid gap-2">
        <h2 id="wd-issued" className="text-xl font-light text-foreground">
          {t("issued")}
        </h2>
        {data && !data.cfdis.length && <p className="text-sm text-zinc-400">{t("issuedNone")}</p>}
        <ul className="grid gap-1.5">
          {data?.cfdis.map((x) => (
            <li key={x.id} className="grid gap-2 rounded-xl border border-white/10 p-3 text-sm">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-zinc-100">
                  {name(x.client_id)} <span className="font-mono text-xs text-zinc-400">{`${x.serie}${x.folio} · ${x.receiver_rfc} · ${mxn(x.total)} · ${x.created_at.slice(0, 10)}`}</span>
                </span>
                {x.status === "cancelled" && <span className="text-xs text-red-300">{t("cancelled")}</span>}
              </span>
              <span className="font-mono text-[0.7rem] break-all text-zinc-500">{x.uuid}</span>
              <span className="flex flex-wrap gap-2">
                <a href={`/api/interno/facturas/archivo?id=${encodeURIComponent(x.id)}&formato=pdf`} className={SMALL}>
                  {t("pdf")}
                </a>
                <a href={`/api/interno/facturas/archivo?id=${encodeURIComponent(x.id)}&formato=xml`} className={SMALL}>
                  {t("xml")}
                </a>
                {x.status === "active" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const email = window.prompt(t("emailPrompt"), d.clients.find((c) => c.id === x.client_id)?.fiscal.email ?? "")
                        if (email) void action(`m-${x.id}`, { action: "email", id: x.id, email }, t("emailed"))
                      }}
                      className={SMALL}
                    >
                      {t("email")}
                    </button>
                    <button type="button" onClick={() => window.confirm(t("confirmCancel", { uuid: x.uuid })) && action(`c-${x.id}`, { action: "cancel", id: x.id, motive: "02" }, t("cancelled"))} className={DANGER}>
                      {t("cancel")}
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <details className="rounded-2xl border border-white/10 p-4">
        <summary className="cursor-pointer text-sm font-medium text-foreground">{t("setup.title")}</summary>
        <ol className="mt-3 grid list-decimal gap-1.5 pl-5 text-sm leading-relaxed text-zinc-300">
          {(t.raw("setup.steps") as string[]).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </details>
    </div>
  )
}

function SettingsForm({ t, initial, onSaved }: { t: T; initial: CfdiSettings; onSaved: () => void }) {
  const [s, setS] = useState<CfdiSettings>({ ...DEFAULT_CFDI, ...initial })
  const [saved, setSaved] = useState(false)
  const set = (p: Partial<CfdiSettings>) => {
    setS((x) => ({ ...x, ...p }))
    setSaved(false)
  }
  const save = async () => {
    const r = await fetch("/api/interno/facturas", { method: "PUT", headers: headers(), body: JSON.stringify({ settings: s }) }).catch(() => null)
    if (r?.ok) {
      setSaved(true)
      onSaved()
    }
  }
  return (
    <section aria-labelledby="wd-cfdi-settings" className="grid gap-3 rounded-2xl border border-white/10 p-4">
      <h2 id="wd-cfdi-settings" className="text-lg font-light text-foreground">
        {t("settings.title")}
      </h2>
      <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TextField label={t("settings.expeditionPlace")} value={s.expeditionPlace} onChange={(expeditionPlace) => set({ expeditionPlace })} />
        <TextField label={t("settings.serie")} value={s.serie} onChange={(serie) => set({ serie })} />
        <TextField label={t("settings.productCode")} value={s.productCode} onChange={(productCode) => set({ productCode })} hint={t("settings.productHint")} />
        <TextField label={t("settings.unitCode")} value={s.unitCode} onChange={(unitCode) => set({ unitCode })} />
        <TextField label={t("settings.unit")} value={s.unit} onChange={(unit) => set({ unit })} />
        <TextField label={t("settings.description")} value={s.description} onChange={(description) => set({ description })} hint={t("settings.descriptionHint")} />
      </div>
      {!settingsReady(s) && <p className="text-xs text-amber-200">{t("settings.notReady")}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} className={PRIMARY}>
          {t("settings.save")}
        </button>
        {saved && <span className="text-xs text-emerald-300">{t("settings.saved")}</span>}
      </div>
    </section>
  )
}

/** A client's fiscal data, saved on the client (synced like any other edit in Clientes). */
function FiscalEditor({ t, clients }: { t: T; clients: Client[] }) {
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)
  const shown = q.trim() ? clients.filter((c) => fold([c.name, c.fiscal.rfc, c.fiscal.name, c.building, c.apartment].join(" ")).includes(fold(q.trim()))).slice(0, 20) : []
  const c = clients.find((x) => x.id === openId)
  const up = (p: Partial<Fiscal>) => c && saveClient({ ...c, fiscal: { ...c.fiscal, ...p }, updatedAt: new Date().toISOString() })
  const issues = c ? fiscalIssues(c.fiscal) : []
  return (
    <section aria-labelledby="wd-fiscal" className="grid gap-3 rounded-2xl border border-white/10 p-4">
      <h2 id="wd-fiscal" className="text-lg font-light text-foreground">
        {t("fiscal.title")}
      </h2>
      <div className="max-w-md">
        <TextField label={t("fiscal.search")} value={q} onChange={setQ} />
      </div>
      {q.trim() && !shown.length && <p className="text-sm text-zinc-400">{t("fiscal.none")}</p>}
      <ul className="flex flex-wrap gap-2">
        {shown.map((x) => (
          <li key={x.id}>
            <button type="button" onClick={() => setOpenId(x.id)} aria-pressed={openId === x.id} className={`${SMALL} aria-pressed:bg-white/10`}>
              {clientLabel(x)}
            </button>
          </li>
        ))}
      </ul>
      {c && (
        <div className="grid gap-3">
          <p className="text-sm text-zinc-200">{clientLabel(c)}</p>
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <TextField label={t("fiscal.rfc")} value={c.fiscal.rfc} onChange={(rfc) => up({ rfc: rfc.toUpperCase().slice(0, 13) })} />
            <TextField label={t("fiscal.name")} value={c.fiscal.name} onChange={(name) => up({ name: name.toUpperCase().slice(0, 254) })} />
            <PickField label={t("fiscal.regime")} value={c.fiscal.regime} onChange={(regime) => up({ regime })} options={[{ value: "", label: "—" }, ...REGIMES.map((r) => ({ value: r, label: t(`fiscal.regimes.${r}`) }))]} />
            <TextField label={t("fiscal.zip")} value={c.fiscal.zip} onChange={(zip) => up({ zip: zip.replace(/\D/g, "").slice(0, 5) })} />
            <PickField label={t("fiscal.use")} value={c.fiscal.use} onChange={(use) => up({ use })} options={[{ value: "", label: "—" }, ...USES.map((u) => ({ value: u, label: t(`fiscal.uses.${u}`) }))]} />
            <TextField label={t("fiscal.email")} type="email" value={c.fiscal.email} onChange={(email) => up({ email: email.slice(0, 200) })} />
          </div>
          <p className={`text-xs ${issues.length ? "text-amber-200" : "text-emerald-300"}`}>{issues.length ? issues.map((i) => t(`fiscal.issues.${i}`)).join(" · ") : t("fiscal.complete")}</p>
        </div>
      )}
    </section>
  )
}
