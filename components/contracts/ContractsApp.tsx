"use client"

import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { AreaField, DateField, GRID, PickField } from "@/components/surveys/SurveyFields"
import { QuickAdd } from "@/components/interno/QuickAdd"
import { RecordHistory } from "@/components/interno/RecordHistory"
import { useOpenParam } from "@/components/interno/useOpenParam"
import { DANGER, Tile } from "@/components/finance/FinParts"
import { AgreementsApp } from "@/components/sites/AgreementsApp"
import { CONTRACT_KINDS, RENEWALS, contractStatus, datesFromSite, newContract, type Contract, type ContractKind, type ContractStatus } from "@/lib/contracts/model"
import { contractsStore } from "@/lib/contracts/store"
import { clientLabel, type Client } from "@/lib/clients/model"
import { clientsServerSnapshot, clientsSnapshot, subscribeClients } from "@/lib/clients/store"
import { providerName, type Provider } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { DEFAULT_NOTICE_DAYS, siteLabel, type Site } from "@/lib/sites/model"
import { sitesServerSnapshot, sitesSnapshot, subscribeSites } from "@/lib/sites/store"
import { localToday } from "@/lib/clients/from-lead"
import { mxn } from "@/lib/materials/catalog"
import { readState } from "@/lib/sync/state"
import { ContractFiles } from "./ContractFiles"

type T = ReturnType<typeof useTranslations>
const SHOWS = ["activos", "atencion", "terminados", "todos"] as const
type Show = (typeof SHOWS)[number]
const TONE: Record<ContractStatus, string> = {
  vencido: "border-red-400/40 text-red-200",
  "por-vencer": "border-amber-300/40 text-amber-100",
  "sin-fecha": "border-white/15 text-zinc-300",
  renovado: "border-emerald-400/30 text-emerald-200",
  vigente: "border-emerald-400/30 text-emerald-200",
  terminado: "border-white/15 text-zinc-400",
}
const ORDER: ContractStatus[] = ["vencido", "por-vencer", "sin-fecha", "vigente", "renovado", "terminado"]
const TAB = "inline-flex min-h-10 items-center rounded-full border px-4 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

type Lists = { clients: Client[]; sites: Site[]; providers: Provider[] }

/** Who the contract is with: the client, deployment or provider its kind points at, else the typed name. */
function partyOf(c: Contract, l: Lists): string {
  const client = c.kind === "cliente" && c.clientId ? l.clients.find((x) => x.id === c.clientId) : undefined
  const site = c.kind === "edificio" && c.siteId ? l.sites.find((x) => x.id === c.siteId) : undefined
  const p = (c.kind === "carrier" || c.kind === "proveedor") && c.providerId ? l.providers.find((x) => x.id === c.providerId) : undefined
  return client ? clientLabel(client) : site ? siteLabel(site) : p ? providerName(p) : c.party
}

/**
 * /interno/admin/legal/contratos (owner, 2026-11-21): the register of contracts with their signed copies, and the
 * building agreements as a second view (?vista=edificios). A contract opens with ?k=<id> (links from Hoy).
 */
export function ContractsApp() {
  const t = useTranslations("contratos")
  const [view, setView] = useOpenParam("vista")
  const tab = view === "edificios" ? "edificios" : "contratos"
  return (
    <div className="mt-6 grid gap-6">
      <div role="group" aria-label={t("views.label")} className="flex flex-wrap gap-2">
        {(["contratos", "edificios"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={tab === v}
            onClick={() => setView(v === "edificios" ? "edificios" : null)}
            className={`${TAB} ${tab === v ? "border-white/40 bg-white/10 text-foreground" : "border-white/15 text-zinc-300 hover:bg-white/5"}`}
          >
            {t(`views.${v}`)}
          </button>
        ))}
      </div>
      {tab === "edificios" ? <AgreementsApp /> : <Register t={t} />}
    </div>
  )
}

function Register({ t }: { t: T }) {
  const store = useSyncExternalStore(contractsStore.subscribe, contractsStore.snapshot, contractsStore.serverSnapshot)
  const clients = useSyncExternalStore(subscribeClients, clientsSnapshot, clientsServerSnapshot)
  const sites = useSyncExternalStore(subscribeSites, sitesSnapshot, sitesServerSnapshot)
  const providers = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot)
  const [show, setShow] = useState<Show>("activos")
  const [kind, setKind] = useState<ContractKind | "">("")
  const [q, setQ] = useState("")
  const [openId, setOpenId] = useOpenParam("k")
  if (!store.loaded || !clients.loaded || !sites.loaded || !providers.loaded) return null
  const lists: Lists = { clients: clients.list, sites: sites.list, providers: providers.list }
  const today = localToday()
  const rows = store.list.map((c) => ({ c, s: contractStatus(c, sites.list, today) }))
  const live = rows.filter((r) => r.s.status !== "terminado" && r.s.status !== "vencido")
  const count = (st: ContractStatus) => rows.filter((r) => r.s.status === st).length
  const wanted = (st: ContractStatus) =>
    show === "todos" ? true : show === "terminados" ? st === "terminado" : show === "atencion" ? st === "vencido" || st === "por-vencer" : st !== "terminado" && st !== "vencido"
  const shown = rows
    .filter((r) => r.c.id === openId || (wanted(r.s.status) && (!kind || r.c.kind === kind)))
    .filter((r) => r.c.id === openId || !q.trim() || fold([r.c.title, partyOf(r.c, lists), r.c.number, r.c.notes, ...r.c.files.map((f) => f.name)].join(" ")).includes(fold(q.trim())))
    .sort((a, b) => ORDER.indexOf(a.s.status) - ORDER.indexOf(b.s.status) || (a.s.end || "9").localeCompare(b.s.end || "9") || a.c.title.localeCompare(b.c.title, "es"))
  const add = (v: Record<string, string>) => {
    const k = (CONTRACT_KINDS as readonly string[]).includes(v.kind) ? (v.kind as ContractKind) : "otro"
    const c = newContract({ title: v.title.slice(0, 200), kind: k, party: v.party.slice(0, 200), by: readState().name, updatedAt: new Date().toISOString() })
    contractsStore.save(c)
    setOpenId(c.id)
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label={t("tiles.active")} value={String(live.length)} />
        <Tile label={t("tiles.soon")} value={String(count("por-vencer"))} tone={count("por-vencer") ? "text-amber-200" : ""} />
        <Tile label={t("tiles.ended")} value={String(count("vencido"))} tone={count("vencido") ? "text-red-300" : ""} />
        <Tile label={t("tiles.unsigned")} value={String(live.filter((r) => !r.c.files.length).length)} hint={t("tiles.unsignedHint")} tone={live.some((r) => !r.c.files.length) ? "text-amber-200" : ""} />
        <Tile label={t("tiles.monthly")} value={mxn(live.reduce((a, r) => a + r.c.monthly, 0))} />
      </div>
      <QuickAdd
        title={t("add")}
        submit={t("addSubmit")}
        hint={t("addHint")}
        initial={kind ? { kind } : {}}
        fields={[
          { key: "title", label: t("titleField"), required: true, placeholder: t("titlePlaceholder") },
          { key: "kind", label: t("kind"), kind: "select", options: CONTRACT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) })) },
          { key: "party", label: t("party") },
        ]}
        onAdd={add}
      />
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <PickField label={t("show")} value={show} onChange={setShow} options={SHOWS.map((s) => ({ value: s, label: t(`shows.${s}`) }))} />
        <PickField label={t("kind")} value={kind} onChange={setKind} options={[{ value: "" as const, label: t("allKinds") }, ...CONTRACT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))]} />
        <TextField label={t("search")} value={q} onChange={setQ} />
      </div>
      {!shown.length && <p className="text-sm text-zinc-400">{t("empty")}</p>}
      <ul className="grid gap-2">
        {shown.map(({ c, s }) => (
          <li key={c.id}>
            <ContractRow t={t} c={c} status={s.status} end={s.end} party={partyOf(c, lists)} lists={lists} today={today} open={openId === c.id} onToggle={() => setOpenId(openId === c.id ? null : c.id)} />
          </li>
        ))}
      </ul>
    </>
  )
}

function ContractRow({ t, c, status, end, party, lists, today, open, onToggle }: { t: T; c: Contract; status: ContractStatus; end: string; party: string; lists: Lists; today: string; open: boolean; onToggle: () => void }) {
  const up = (p: Partial<Contract>) => contractsStore.save({ ...c, ...p, updatedAt: new Date().toISOString() })
  const site = c.siteId ? lists.sites.find((x) => x.id === c.siteId) : undefined
  const fromSite = datesFromSite(c) && !!site
  return (
    <div className="rounded-xl border border-white/10">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="grid gap-0.5">
          <span className="text-sm text-zinc-100">{c.title || t("noTitle")}</span>
          <span className="font-mono text-xs text-zinc-400">{[t(`kinds.${c.kind}`), party, end ? t("ends", { date: end }) : t("noEnd"), t("filesCount", { n: c.files.length })].filter(Boolean).join(" · ")}</span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${TONE[status]}`}>{t(`status.${status}`)}</span>
      </button>
      {open && (
        <div className="grid gap-5 border-t border-white/10 p-3">
          <div className={GRID}>
            <TextField label={t("titleField")} value={c.title} onChange={(title) => up({ title: title.slice(0, 200) })} />
            <PickField label={t("kind")} value={c.kind} onChange={(kind) => up({ kind })} options={CONTRACT_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))} />
            <PartyFields t={t} c={c} lists={lists} up={up} />
            <TextField label={t("number")} value={c.number} onChange={(number) => up({ number: number.slice(0, 80) })} />
            <DateField label={t("signedDate")} value={c.signedDate} onChange={(signedDate) => up({ signedDate })} />
            {!fromSite && (
              <>
                <DateField label={t("startDate")} value={c.startDate} onChange={(startDate) => up({ startDate })} />
                <DateField label={t("endDate")} value={c.endDate} onChange={(endDate) => up({ endDate })} />
                <PickField label={t("renewal")} value={c.renewal} onChange={(renewal) => up({ renewal })} options={RENEWALS.map((r) => ({ value: r, label: t(`renewals.${r}`) }))} />
                <NumberField label={t("noticeDays")} unit={t("days")} optional integer max={730} value={c.noticeDays} onChange={(noticeDays) => up({ noticeDays })} hint={t("noticeHint", { n: DEFAULT_NOTICE_DAYS })} />
              </>
            )}
            <NumberField label={t("monthly")} unit="MXN" optional max={1e9} precision={2} value={c.monthly || null} onChange={(v) => up({ monthly: v ?? 0 })} hint={t("monthlyHint")} />
          </div>
          {fromSite && site && (
            <p className="text-sm text-zinc-300">
              {t("fromSite", { status: end ? `${t(`status.${contractStatus(c, lists.sites, today).status}`).toLowerCase()}, ${t("ends", { date: end })}` : t("fromSiteNoEnd") })}{" "}
              <a href={`/interno/admin/despliegues?d=${site.id}#acuerdo`} className="text-cyan-200 underline underline-offset-4">
                {t("fromSiteEdit")}
              </a>
            </p>
          )}
          <ContractFiles c={c} />
          <AreaField label={t("notes")} value={c.notes} onChange={(notes) => up({ notes: notes.slice(0, 4000) })} rows={3} />
          <label className="flex min-h-10 items-center gap-2 text-sm text-zinc-200">
            <input type="checkbox" checked={c.ended} onChange={(e) => up({ ended: e.target.checked })} className="size-5 accent-white" />
            {t("endedBox")}
          </label>
          <RecordHistory kind="contratos" id={c.id} />
          <button type="button" onClick={() => window.confirm(t("confirmRemove")) && contractsStore.remove(c.id)} className={DANGER}>
            {t("remove")}
          </button>
        </div>
      )}
    </div>
  )
}

/** Who it's with, by kind: a client, a deployment, a provider (carriers are providers too), or a typed name. */
function PartyFields({ t, c, lists, up }: { t: T; c: Contract; lists: Lists; up: (p: Partial<Contract>) => void }) {
  const typed = <TextField label={t("partyName")} value={c.party} onChange={(party) => up({ party: party.slice(0, 200) })} />
  if (c.kind === "cliente")
    return (
      <>
        <PickField label={t("client")} value={c.clientId} onChange={(clientId) => up({ clientId })} options={[{ value: "", label: t("noClient") }, ...lists.clients.map((x) => ({ value: x.id, label: clientLabel(x) })).sort((a, b) => a.label.localeCompare(b.label, "es"))]} />
        {!c.clientId && typed}
      </>
    )
  if (c.kind === "edificio")
    return (
      <>
        <PickField label={t("site")} value={c.siteId} onChange={(siteId) => up({ siteId })} options={[{ value: "", label: t("noSite") }, ...lists.sites.map((x) => ({ value: x.id, label: siteLabel(x) }))]} />
        {!c.siteId && typed}
      </>
    )
  if (c.kind === "carrier" || c.kind === "proveedor")
    return (
      <>
        <PickField label={t("provider")} value={c.providerId} onChange={(providerId) => up({ providerId })} options={[{ value: "", label: t("noProvider") }, ...lists.providers.map((x) => ({ value: x.id, label: providerName(x) || x.id.slice(0, 6) }))]} />
        {!c.providerId && typed}
      </>
    )
  return typed
}
