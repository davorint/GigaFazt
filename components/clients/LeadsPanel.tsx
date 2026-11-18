"use client"

import { LEADS_LIMIT } from "@/lib/leads/limits"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { PickField } from "@/components/surveys/SurveyFields"
import { clientFromLead } from "@/lib/clients/from-lead"
import { clientsServerSnapshot, clientsSnapshot, saveClient, subscribeClients } from "@/lib/clients/store"
import { getPlan } from "@/lib/plans"
import { speedLabel } from "@/lib/format"
import { readState } from "@/lib/sync/state"

type Status = "nuevo" | "contactado" | "instalado" | "descartado"
type Lead = { id: string; createdAt: string; name: string; phone: string; email: string; address: string; planId: string; addOnIds: string[]; preferredDate: string; status: Status; notes: string; updatedBy: string }
const STATUSES: Status[] = ["nuevo", "contactado", "instalado", "descartado"]
const TONE: Record<Status, string> = {
  nuevo: "border-cyan-400/40 text-cyan-200",
  contactado: "border-amber-400/40 text-amber-200",
  instalado: "border-emerald-400/40 text-emerald-300",
  descartado: "border-white/15 text-zinc-400",
}
const SMALL = "inline-flex min-h-9 items-center rounded-full border border-white/15 px-3 text-xs text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const headers = () => ({ "content-type": "application/json", "x-interno-nombre": encodeURIComponent(readState().name) })

/** The website's requests (read from the database: needs a connection), with status, notes and "convert to client". */
export function LeadsPanel({ onClient }: { onClient: (clientId: string) => void }) {
  const t = useTranslations("clientes.leads")
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const [leads, setLeads] = useState<Lead[] | null>(null)
  const [state, setState] = useState<"loading" | "ok" | "offline" | "error">("loading")
  const [filter, setFilter] = useState<Status | "">("")
  const load = useCallback(async () => {
    if (!navigator.onLine) return setState("offline")
    setState("loading")
    try {
      const r = await fetch("/api/interno/leads", { headers: headers() })
      if (!r.ok) throw new Error(String(r.status))
      setLeads(((await r.json()) as { leads: Lead[] }).leads)
      setState("ok")
    } catch {
      setState("error")
    }
  }, [])
  // Loads once when the tab opens (a fetch, not derived state).
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the request's result is external data, set when it arrives
  useEffect(() => void load(), [load])
  const patch = async (id: string, body: { status?: Status; notes?: string }) => {
    const r = await fetch("/api/interno/leads", { method: "PATCH", headers: headers(), body: JSON.stringify({ id, ...body }) })
    if (!r.ok) return false
    const { lead } = (await r.json()) as { lead: Lead }
    setLeads((ls) => (ls ?? []).map((x) => (x.id === id ? lead : x)))
    return true
  }
  const convert = async (l: Lead) => {
    const c = clientFromLead(l)
    saveClient(c)
    await patch(l.id, { status: "instalado" })
    onClient(c.id)
  }
  const shown = (leads ?? []).filter((l) => !filter || l.status === filter)
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-relaxed text-zinc-300">{t("intro")}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48">
          <PickField label={t("filter")} value={filter} onChange={setFilter} options={[{ value: "" as const, label: t("all") }, ...STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))]} />
        </div>
        <button type="button" onClick={() => void load()} className={SMALL}>
          {t("reload")}
        </button>
      </div>
      <div aria-live="polite">
        {state === "loading" && <p className="text-sm text-zinc-400">{t("loading")}</p>}
        {state === "offline" && <p className="text-sm text-amber-200">{t("offline")}</p>}
        {state === "error" && <p className="text-sm text-red-300">{t("error")}</p>}
        {state === "ok" && <p className="font-mono text-xs text-zinc-400">{t("count", { n: leads?.length ?? 0, fresh: (leads ?? []).filter((l) => l.status === "nuevo").length })}</p>}
        {/* The server sends the newest LEADS_LIMIT (lib/leads/server.ts listLeads). */}
        {state === "ok" && (leads?.length ?? 0) >= LEADS_LIMIT && <p className="text-xs text-amber-200">{t("capped", { n: LEADS_LIMIT })}</p>}
      </div>
      {state === "ok" && !shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      <ul className="grid gap-3">
        {shown.map((l) => (
          <li key={l.id}>
            <LeadCard t={t} l={l} client={clients.list.find((c) => c.leadId === l.id)?.id} onStatus={(s) => void patch(l.id, { status: s })} onNotes={(n) => patch(l.id, { notes: n })} onConvert={() => void convert(l)} onShow={onClient} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function LeadCard({
  t,
  l,
  client,
  onStatus,
  onNotes,
  onConvert,
  onShow,
}: {
  t: ReturnType<typeof useTranslations>
  l: Lead
  client?: string
  onStatus: (s: Status) => void
  onNotes: (n: string) => Promise<boolean>
  onConvert: () => void
  onShow: (id: string) => void
}) {
  const [notes, setNotes] = useState(l.notes)
  const [saved, setSaved] = useState(false)
  const plan = getPlan(l.planId)
  const digits = l.phone.replace(/\D/g, "")
  const wa = digits.length === 10 ? `52${digits}` : digits
  const date = (iso: string) => new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
  return (
    <div className="grid gap-3 rounded-xl border border-white/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="text-sm font-medium text-zinc-100">{l.name}</p>
          <p className="text-xs text-zinc-300">{l.address}</p>
          <p className="font-mono text-xs text-zinc-400">
            {t("plan", { plan: plan ? speedLabel(plan.downMbps) : l.planId })}
            {l.addOnIds.includes("tv") ? ` · ${t("tv")}` : ""}
            {l.preferredDate ? ` · ${t("preferred", { date: l.preferredDate })}` : ""} · {t("received", { date: date(l.createdAt) })}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE[l.status]}`}>{t(`statuses.${l.status}`)}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`tel:${digits}`} className={SMALL}>
          {t("call")} {l.phone}
        </a>
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={SMALL}>
          {t("whatsapp")}
        </a>
        {l.email && (
          <a href={`mailto:${l.email}`} className={SMALL}>
            {l.email}
          </a>
        )}
      </div>
      <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <PickField label={t("filter")} value={l.status} onChange={onStatus} options={STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} />
        {client ? (
          <button type="button" onClick={() => onShow(client)} className={`${SMALL} h-10 w-fit`}>
            {t("converted")}
          </button>
        ) : (
          <button type="button" onClick={onConvert} className="h-10 w-fit rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            {t("convert")}
          </button>
        )}
      </div>
      <label className="grid gap-1.5">
        <span className="font-mono text-xs text-zinc-300">{t("notes")}</span>
        <textarea
          value={notes}
          rows={2}
          onChange={(e) => {
            setNotes(e.target.value)
            setSaved(false)
          }}
          className="rounded-md border border-input bg-white/[0.03] px-2.5 py-2 text-base text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void onNotes(notes).then((ok) => setSaved(ok))} disabled={notes === l.notes} className={`${SMALL} disabled:opacity-50`}>
          {t("saveNotes")}
        </button>
        {saved && (
          <span role="status" className="text-xs text-emerald-300">
            {t("saved")}
          </span>
        )}
      </div>
    </div>
  )
}
