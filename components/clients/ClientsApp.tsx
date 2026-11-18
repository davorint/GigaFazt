"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { clientsCsv, IMPORT_FIELDS, type ImportField } from "@/lib/clients/import"
import { CLIENT_STATUSES, PAY_METHODS, clientLabel, newClient, type Client, type ClientStatus } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, deleteClient, saveClient, subscribeClients } from "@/lib/clients/store"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { ImportPanel } from "./ImportPanel"
import { LeadsPanel } from "./LeadsPanel"

type T = ReturnType<typeof useTranslations>
const TABS = ["clients", "leads", "import"] as const
type Tab = (typeof TABS)[number]
const BTN = "h-11 rounded-full border border-white/15 px-5 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const PRIMARY = "h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
const TONE: Record<ClientStatus, string> = {
  activo: "border-emerald-400/40 text-emerald-300",
  suspendido: "border-amber-400/40 text-amber-200",
  cancelado: "border-white/15 text-zinc-400",
}
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Subscribers, website requests and the import, as three tabs of /interno/admin/clientes. */
export function ClientsApp() {
  const t = useTranslations("clientes")
  const [tab, setTab] = useState<Tab>("clients")
  const [openId, setOpenId] = useState<string | null>(null)
  const show = (id: string) => {
    setTab("clients")
    setOpenId(id)
  }
  return (
    <div className="mt-6 grid gap-5">
      <div role="tablist" aria-label={t("title")} className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 sm:w-fit">
        {TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            id={`tab-${k}`}
            aria-selected={tab === k}
            aria-controls={`panel-${k}`}
            onClick={() => setTab(k)}
            className="h-10 flex-1 rounded-lg px-4 text-sm text-zinc-400 aria-selected:bg-white/10 aria-selected:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-none"
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="min-w-0">
        {tab === "clients" && <ClientList t={t} openId={openId} setOpenId={setOpenId} />}
        {tab === "leads" && <LeadsPanel onClient={show} />}
        {tab === "import" && <ImportPanel />}
      </div>
    </div>
  )
}

function ClientList({ t, openId, setOpenId }: { t: T; openId: string | null; setOpenId: (id: string | null) => void }) {
  const store = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const [q, setQ] = useState("")
  const [status, setStatus] = useState<ClientStatus | "">("")
  const [building, setBuilding] = useState("")
  const list = store.list
  const buildings = useMemo(() => [...new Set(list.map((c) => c.building.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [list])
  if (!store.loaded) return null
  const needle = fold(q.trim())
  const shown = list
    .filter((c) => (!status || c.status === status) && (!building || c.building.trim() === building))
    .filter((c) => !needle || fold([c.name, c.phone, c.whatsapp, c.email, c.building, c.tower, c.apartment, c.pppoeUser, c.ontSn].join(" ")).includes(needle))
    .sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "es"))
  const add = () => {
    const c = newClient({ building })
    saveClient(c)
    setOpenId(c.id)
    setQ("")
    setStatus("")
  }
  const headers = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, t(`fields.${f}`)])) as Record<ImportField, string>
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={add} className={PRIMARY}>
          {t("list.add")}
        </button>
        {list.length > 0 && (
          <button type="button" onClick={() => download(`clientes-${localToday()}.csv`, clientsCsv(shown, headers), "text/csv;charset=utf-8")} className={BTN}>
            {t("list.exportCsv")}
          </button>
        )}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <TextField label={t("list.search")} value={q} onChange={setQ} hint={t("list.searchHint")} />
        <PickField label={t("list.status")} value={status} onChange={setStatus} options={[{ value: "" as const, label: t("list.allStatuses") }, ...CLIENT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))]} />
        <PickField label={t("list.building")} value={building} onChange={setBuilding} options={[{ value: "", label: t("list.allBuildings") }, ...buildings.map((b) => ({ value: b, label: b }))]} />
      </div>
      <p className="font-mono text-xs text-zinc-400">{t("list.count", { shown: shown.length, n: list.length, active: list.filter((c) => c.status === "activo").length })}</p>
      {!shown.length && <p className="text-sm text-zinc-400">{t("list.empty")}</p>}
      <ul className="grid gap-2">
        {shown.map((c) => (
          <li key={c.id}>
            <Row t={t} c={c} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Row({ t, c, open, onToggle }: { t: T; c: Client; open: boolean; onToggle: () => void }) {
  const where = [c.building, c.tower, c.apartment].filter(Boolean).join(" · ")
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm text-zinc-100">{c.name || c.pppoeUser || t("list.untitled")}</span>
          <span className="truncate font-mono text-xs text-zinc-400">
            {[where, c.plan, c.pppoeUser && c.name ? c.pppoeUser : ""].filter(Boolean).join(" · ") || "—"}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${TONE[c.status]}`}>{t(`statuses.${c.status}`)}</span>
      </button>
      {open && <Editor t={t} c={c} />}
    </div>
  )
}

function Editor({ t, c }: { t: T; c: Client }) {
  const up = (p: Partial<Client>) => saveClient({ ...c, ...p })
  const text = (f: "name" | "phone" | "whatsapp" | "email" | "building" | "tower" | "apartment" | "plan" | "ontModel" | "pppoeUser" | "deployment" | "oltPort", hint?: string) => (
    <TextField label={t(`fields.${f}`)} value={c[f]} onChange={(v) => up({ [f]: v })} hint={hint} />
  )
  return (
    <div className="grid gap-5 border-t border-white/10 p-3">
      {c.leadId && <p className="text-xs text-cyan-200">{t("list.fromLead")}</p>}
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("list.groups.contact")}</legend>
        <div className={GRID}>
          {text("name")}
          {text("phone")}
          {text("whatsapp")}
          {text("email")}
          {text("building")}
          {text("tower")}
          {text("apartment")}
        </div>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("list.groups.service")}</legend>
        <div className={GRID}>
          <PickField label={t("fields.status")} value={c.status} onChange={(status) => up({ status })} options={CLIENT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))} />
          {text("plan", t("list.planHint"))}
          <PickField label={t("fields.tv")} value={c.tv ? "si" : "no"} onChange={(v) => up({ tv: v === "si" })} options={[{ value: "no", label: t("list.no") }, { value: "si", label: t("list.yes") }]} />
          <DateField label={t("fields.installDate")} value={c.installDate} onChange={(v) => up({ installDate: v })} />
          <NumberField label={t("fields.monthly")} unit={t("list.perMonth")} optional max={1e6} value={c.monthly} onChange={(v) => up({ monthly: v })} hint={c.monthly !== null ? mxn(c.monthly) : undefined} />
        </div>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("list.groups.network")}</legend>
        <div className={GRID}>
          {text("ontModel")}
          <TextField label={t("fields.ontSn")} value={c.ontSn} onChange={(v) => up({ ontSn: v.toUpperCase().slice(0, 40) })} />
          {text("pppoeUser")}
          {text("deployment")}
          {text("oltPort")}
          <NumberField label={t("fields.ontId")} unit="#" integer optional max={255} value={c.ontId} onChange={(v) => up({ ontId: v })} />
        </div>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium text-foreground">{t("list.groups.billing")}</legend>
        <div className={GRID}>
          <NumberField label={t("fields.payDay")} unit="1–31" integer optional min={1} max={31} value={c.payDay} onChange={(v) => up({ payDay: v })} />
          <PickField label={t("fields.payMethod")} value={c.payMethod} onChange={(payMethod) => up({ payMethod })} options={PAY_METHODS.map((m) => ({ value: m, label: t(`methods.${m || "none"}`) }))} />
        </div>
        <AreaField label={t("fields.notes")} value={c.notes} onChange={(v) => up({ notes: v })} />
      </fieldset>
      <button
        type="button"
        onClick={() => window.confirm(t("list.confirmRemove", { name: clientLabel(c) })) && deleteClient(c.id)}
        className="h-10 w-fit rounded-full border border-red-400/30 px-4 text-sm text-red-200 hover:bg-red-400/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {t("list.remove")}
      </button>
    </div>
  )
}
