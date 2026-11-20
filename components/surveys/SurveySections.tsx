"use client"

import { PlaceFields } from "@/components/interno/PlaceFields"
import { useState, useSyncExternalStore } from "react"
import { useTranslations } from "next-intl"
import { NumberField } from "@/components/mikrotik/NumberField"
import { TextField } from "@/components/mikrotik/TextField"
import { MAX_ITEMS, newId, type Area, type Carrier, type Contact, type Pending, type Provider, type Route, type Survey } from "@/lib/survey/model"
import { mxn } from "@/lib/materials/catalog"
import { isKind, providerName } from "@/lib/providers/model"
import { providersServerSnapshot, providersSnapshot, subscribeProviders } from "@/lib/providers/store"
import { AddButton, ApprovalField, AreaField, DateField, GRID, ItemCard, PickField, TriField } from "./SurveyFields"

export type SectionProps = { s: Survey; set: (s: Survey) => void }

/** Replaces one item of a list by id. */
const patch = <T extends { id: string }>(xs: T[], id: string, p: Partial<T>) => xs.map((x) => (x.id === id ? { ...x, ...p } : x))
const without = <T extends { id: string }>(xs: T[], id: string) => xs.filter((x) => x.id !== id)

export function IdentSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos.ident")
  const i = s.ident
  const up = (p: Partial<Survey["ident"]>) => set({ ...s, ident: { ...i, ...p } })
  const [locating, setLocating] = useState<"" | "busy" | "error">("")
  const locate = () => {
    if (!("geolocation" in navigator)) return setLocating("error")
    setLocating("busy")
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating("")
        up({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 })
      },
      () => setLocating("error"),
      { enableHighAccuracy: true, timeout: 15000 }
    )
  }
  return (
    <div className="grid gap-4">
      <TextField label={t("name")} value={i.name} onChange={(v) => up({ name: v })} />
      <TextField label={t("address")} value={i.address} onChange={(v) => up({ address: v })} />
      <PlaceFields state={i.state} municipality={i.municipality} onChange={(p) => up(p)} />
      <DateField label={t("visitDate")} value={i.visitDate} onChange={(v) => up({ visitDate: v })} />
      <TextField label={t("surveyors")} value={i.surveyors} onChange={(v) => up({ surveyors: v })} />
      <div className="grid gap-3 rounded-xl border border-white/10 p-4">
        <p className="text-sm font-medium text-foreground">{t("location")}</p>
        <button type="button" onClick={locate} disabled={locating === "busy"} className="h-11 rounded-xl border border-white/15 text-sm text-zinc-100 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:w-fit sm:px-5">
          {locating === "busy" ? t("locating") : t("locate")}
        </button>
        {locating === "error" && (
          <p role="status" className="text-xs text-amber-200">
            {t("locateError")}
          </p>
        )}
        <div className={GRID}>
          <NumberField label={t("lat")} unit="°" value={i.lat} min={-90} max={90} precision={6} optional onChange={(v) => up({ lat: v })} />
          <NumberField label={t("lng")} unit="°" value={i.lng} min={-180} max={180} precision={6} optional onChange={(v) => up({ lng: v })} />
        </div>
      </div>
    </div>
  )
}

export function ContactsSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const p = s.permits
  const upP = (x: Partial<Survey["permits"]>) => set({ ...s, permits: { ...p, ...x } })
  const upC = (id: string, x: Partial<Contact>) => set({ ...s, contacts: patch(s.contacts, id, x) })
  const roles = ["administrador", "comite", "mantenimiento", "otro"] as const
  return (
    <div className="grid gap-6">
      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("contacts.title")}</h3>
        {s.contacts.map((c, k) => (
          <ItemCard key={c.id} title={c.name || t("contactItem", { n: k + 1 })} removeLabel={t("editor.remove")} onRemove={() => set({ ...s, contacts: without(s.contacts, c.id) })}>
            <div className={GRID}>
              <PickField label={t("contacts.role")} value={c.role} onChange={(v) => upC(c.id, { role: v })} options={roles.map((r) => ({ value: r, label: t(`contacts.roles.${r}`) }))} />
              <TextField label={t("contacts.name")} value={c.name} onChange={(v) => upC(c.id, { name: v })} />
              <TextField label={t("contacts.phone")} value={c.phone} onChange={(v) => upC(c.id, { phone: v })} type="tel" />
              <TextField label={t("contacts.email")} value={c.email} onChange={(v) => upC(c.id, { email: v })} type="email" />
            </div>
            <AreaField label={t("contacts.notes")} value={c.notes} onChange={(v) => upC(c.id, { notes: v })} rows={2} />
          </ItemCard>
        ))}
        <AddButton
          disabled={s.contacts.length >= MAX_ITEMS}
          onClick={() => set({ ...s, contacts: [...s.contacts, { id: newId(), role: s.contacts.length ? "otro" : "administrador", name: "", phone: "", email: "", notes: "" }] })}
        >
          {t("editor.add")}
        </AddButton>
      </div>
      <div className="grid gap-4">
        <h3 className="text-base font-medium text-foreground">{t("contacts.permitsTitle")}</h3>
        <div className={GRID}>
          <ApprovalField label={t("contacts.assembly")} value={p.assembly} onChange={(v) => upP({ assembly: v })} />
          <DateField label={t("contacts.assemblyDate")} value={p.assemblyDate} onChange={(v) => upP({ assemblyDate: v })} />
          <ApprovalField label={t("contacts.agreement")} value={p.agreement} onChange={(v) => upP({ agreement: v })} />
          <DateField label={t("contacts.agreementDate")} value={p.agreementDate} onChange={(v) => upP({ agreementDate: v })} />
        </div>
        <AreaField label={t("contacts.workHours")} hint={t("contacts.workHoursHint")} value={p.workHours} onChange={(v) => upP({ workHours: v })} rows={2} />
        <AreaField label={t("contacts.accessRules")} hint={t("contacts.accessRulesHint")} value={p.accessRules} onChange={(v) => upP({ accessRules: v })} />
        <AreaField label={t("contacts.rules")} hint={t("contacts.rulesHint")} value={p.rules} onChange={(v) => upP({ rules: v })} />
      </div>
    </div>
  )
}

export function CommercialSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const c = s.commercial
  const up = (x: Partial<Survey["commercial"]>) => set({ ...s, commercial: { ...c, ...x } })
  const upP = (id: string, x: Partial<Provider>) => up({ providers: patch(c.providers, id, x) })
  const techs = ["", "fibra", "coaxial", "cobre", "inalambrico"] as const
  const payers = ["", "nosotros", "edificio", "pendiente"] as const
  return (
    <div className="grid gap-6">
      <div className={GRID}>
        <NumberField label={t("commercial.units")} unit={t("unit.units")} integer optional max={10000} value={c.units} onChange={(v) => up({ units: v })} />
        <NumberField label={t("commercial.occupied")} unit={t("unit.units")} integer optional max={10000} value={c.occupied} onChange={(v) => up({ occupied: v })} />
        <NumberField label={t("commercial.expected")} unit={t("unit.clients")} integer optional max={10000} value={c.expectedClients} onChange={(v) => up({ expectedClients: v })} hint={t("commercial.expectedHint")} />
      </div>
      <div className="grid gap-3">
        <h3 className="text-base font-medium text-foreground">{t("commercial.providersTitle")}</h3>
        {c.providers.map((p, k) => (
          <ItemCard key={p.id} title={p.name || t("providerItem", { n: k + 1 })} removeLabel={t("editor.remove")} onRemove={() => up({ providers: without(c.providers, p.id) })}>
            <div className={GRID}>
              <TextField label={t("commercial.provider")} value={p.name} onChange={(v) => upP(p.id, { name: v })} />
              <PickField label={t("commercial.tech")} value={p.tech} onChange={(v) => upP(p.id, { tech: v })} options={techs.map((x) => ({ value: x, label: t(`commercial.techs.${x || "none"}`) }))} />
            </div>
            <AreaField label={t("commercial.providerNotes")} value={p.notes} onChange={(v) => upP(p.id, { notes: v })} rows={2} />
          </ItemCard>
        ))}
        <AddButton disabled={c.providers.length >= MAX_ITEMS} onClick={() => up({ providers: [...c.providers, { id: newId(), name: "", tech: "", notes: "" }] })}>
          {t("editor.add")}
        </AddButton>
      </div>
      <div className="grid gap-4">
        <h3 className="text-base font-medium text-foreground">{t("commercial.costsTitle")}</h3>
        <div className={GRID}>
          <NumberField label={t("commercial.rent")} unit={t("commercial.perMonth")} optional max={1e7} value={c.rentMonthly} onChange={(v) => up({ rentMonthly: v })} />
          <NumberField label={t("commercial.power")} unit={t("commercial.perMonth")} optional max={1e7} value={c.powerMonthly} onChange={(v) => up({ powerMonthly: v })} />
          <NumberField label={t("commercial.deposit")} unit={t("commercial.mxn")} optional max={1e7} value={c.deposit} onChange={(v) => up({ deposit: v })} />
          <ApprovalField label={t("commercial.exclusivity")} value={c.exclusivity} onChange={(v) => up({ exclusivity: v })} />
          <PickField label={t("commercial.powerPaidBy")} value={c.powerPaidBy} onChange={(v) => up({ powerPaidBy: v })} options={payers.map((x) => ({ value: x, label: t(`commercial.payers.${x || "none"}`) }))} />
        </div>
        <AreaField label={t("commercial.notes")} value={c.notes} onChange={(v) => up({ notes: v })} />
      </div>
    </div>
  )
}

export function RoomSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos.room")
  const r = s.room
  const up = (x: Partial<Survey["room"]>) => set({ ...s, room: { ...r, ...x } })
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-relaxed text-zinc-300">{t("intro")}</p>
      <TextField label={t("location")} value={r.location} onChange={(v) => up({ location: v })} />
      <TextField label={t("sharedWith")} value={r.sharedWith} onChange={(v) => up({ sharedWith: v })} />
      <div className={GRID}>
        <NumberField label={t("rackU")} unit={t("rackUUnit")} integer optional max={100} value={r.rackU} onChange={(v) => up({ rackU: v })} />
        <NumberField label={t("outlets")} unit={t("outletsUnit")} integer optional max={100} value={r.outlets} onChange={(v) => up({ outlets: v })} />
        <TriField label={t("dedicatedBreaker")} value={r.dedicatedBreaker} onChange={(v) => up({ dedicatedBreaker: v })} />
        <NumberField label={t("amps")} unit="A" optional max={1000} value={r.amps} onChange={(v) => up({ amps: v })} />
        <TriField label={t("ground")} value={r.ground} onChange={(v) => up({ ground: v })} />
        <TriField label={t("ventilation")} value={r.ventilation} onChange={(v) => up({ ventilation: v })} />
        <NumberField label={t("toDuct")} unit="m" optional max={5000} value={r.toDuctM} onChange={(v) => up({ toDuctM: v })} />
      </div>
      <AreaField label={t("access")} value={r.access} onChange={(v) => up({ access: v })} rows={2} />
      <AreaField label={t("carrierEntry")} value={r.carrierEntry} onChange={(v) => up({ carrierEntry: v })} rows={2} />
      <AreaField label={t("notes")} value={r.notes} onChange={(v) => up({ notes: v })} />
      <p className="text-xs leading-snug text-zinc-400">{t("energyLink")}</p>
    </div>
  )
}

export function RoutesSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const up = (id: string, x: Partial<Route>) => set({ ...s, routes: patch(s.routes, id, x) })
  const kinds = ["ducto", "charola", "muro", "plafon", "subterraneo", "aereo", "otro"] as const
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-zinc-300">{t("routes.intro")}</p>
      {s.routes.map((r, k) => (
        <ItemCard key={r.id} title={r.from && r.to ? `${r.from} → ${r.to}` : t("routes.item", { n: k + 1 })} removeLabel={t("editor.remove")} onRemove={() => set({ ...s, routes: without(s.routes, r.id) })}>
          <div className={GRID}>
            <TextField label={t("routes.from")} value={r.from} onChange={(v) => up(r.id, { from: v })} />
            <TextField label={t("routes.to")} value={r.to} onChange={(v) => up(r.id, { to: v })} />
            <PickField label={t("routes.kind")} value={r.kind} onChange={(v) => up(r.id, { kind: v })} options={kinds.map((x) => ({ value: x, label: t(`routes.kinds.${x}`) }))} />
            <NumberField label={t("routes.meters")} unit="m" optional max={10000} value={r.meters} onChange={(v) => up(r.id, { meters: v })} />
          </div>
          <AreaField label={t("routes.obstacles")} hint={t("routes.obstaclesHint")} value={r.obstacles} onChange={(v) => up(r.id, { obstacles: v })} rows={2} />
        </ItemCard>
      ))}
      <AddButton disabled={s.routes.length >= MAX_ITEMS} onClick={() => set({ ...s, routes: [...s.routes, { id: newId(), from: "", to: "", kind: "ducto", meters: null, obstacles: "" }] })}>
        {t("routes.add")}
      </AddButton>
    </div>
  )
}

export function AreasSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const up = (id: string, x: Partial<Area>) => set({ ...s, areas: patch(s.areas, id, x) })
  const kinds = ["lobby", "gimnasio", "alberca", "roofgarden", "salon", "coworking", "estacionamiento", "otro"] as const
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-zinc-300">{t("areas.intro")}</p>
      {s.areas.map((a, k) => (
        <ItemCard key={a.id} title={a.name || `${t(`areas.kinds.${a.kind}`)} · ${t("areas.item", { n: k + 1 })}`} removeLabel={t("editor.remove")} onRemove={() => set({ ...s, areas: without(s.areas, a.id) })}>
          <div className={GRID}>
            <PickField label={t("areas.kind")} value={a.kind} onChange={(v) => up(a.id, { kind: v })} options={kinds.map((x) => ({ value: x, label: t(`areas.kinds.${x}`) }))} />
            <TextField label={t("areas.name")} value={a.name} onChange={(v) => up(a.id, { name: v })} />
            <TriField label={t("areas.wifi")} value={a.wifi} onChange={(v) => up(a.id, { wifi: v })} />
            <NumberField label={t("areas.m2")} unit="m²" optional max={100000} value={a.m2} onChange={(v) => up(a.id, { m2: v })} />
            <TriField label={t("areas.power")} value={a.power} onChange={(v) => up(a.id, { power: v })} />
            <TextField label={t("areas.walls")} hint={t("areas.wallsHint")} value={a.walls} onChange={(v) => up(a.id, { walls: v })} />
          </div>
          <AreaField label={t("areas.route")} value={a.route} onChange={(v) => up(a.id, { route: v })} rows={2} />
          <AreaField label={t("areas.notes")} value={a.notes} onChange={(v) => up(a.id, { notes: v })} rows={2} />
        </ItemCard>
      ))}
      <AddButton
        disabled={s.areas.length >= MAX_ITEMS}
        onClick={() => set({ ...s, areas: [...s.areas, { id: newId(), kind: "lobby", name: "", wifi: "", m2: null, walls: "", power: "", route: "", notes: "" }] })}
      >
        {t("areas.add")}
      </AddButton>
    </div>
  )
}

export function CarriersSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const up = (id: string, x: Partial<Carrier>) => set({ ...s, carriers: patch(s.carriers, id, x) })
  const listed = useSyncExternalStore(subscribeProviders, providersSnapshot, providersServerSnapshot).list.filter((p) => isKind(p, "carrier"))
  const ips = ["", "publica", "nat"] as const
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-zinc-300">{t("carriers.intro")}</p>
      {s.carriers.map((c, k) => (
        <ItemCard key={c.id} title={c.name || t("carriers.item", { n: k + 1 })} removeLabel={t("editor.remove")} onRemove={() => set({ ...s, carriers: without(s.carriers, c.id) })}>
          <PickField
            label={t("carriers.pick")}
            hint={t("carriers.pickHint")}
            value={c.providerId}
            onChange={(v) => {
              const p = listed.find((x) => x.id === v)
              up(c.id, { providerId: v, ...(p ? { name: providerName(p), ip: p.carrier.ip === "publica" || p.carrier.ip === "nat" ? p.carrier.ip : c.ip } : {}) })
            }}
            options={[{ value: "", label: t("carriers.noPick") }, ...listed.map((p) => ({ value: p.id, label: providerName(p) || p.id.slice(0, 6) }))]}
          />
          <CarrierFromList p={listed.find((x) => x.id === c.providerId)} />
          <div className={GRID}>
            <TextField label={t("carriers.name")} value={c.name} onChange={(v) => up(c.id, { name: v })} />
            <TriField label={t("carriers.available")} value={c.available} onChange={(v) => up(c.id, { available: v })} />
            <NumberField label={t("carriers.mbps")} unit="Mbps" optional max={1e6} value={c.mbps} onChange={(v) => up(c.id, { mbps: v })} />
            <NumberField label={t("carriers.leadDays")} unit={t("carriers.days")} integer optional max={3650} value={c.leadDays} onChange={(v) => up(c.id, { leadDays: v })} />
            <PickField label={t("carriers.ip")} value={c.ip} onChange={(v) => up(c.id, { ip: v })} options={ips.map((x) => ({ value: x, label: t(`carriers.ips.${x || "none"}`) }))} />
            <TextField label={t("carriers.entry")} value={c.entry} onChange={(v) => up(c.id, { entry: v })} />
          </div>
          <AreaField label={t("carriers.notes")} value={c.notes} onChange={(v) => up(c.id, { notes: v })} rows={2} />
        </ItemCard>
      ))}
      <AddButton
        disabled={s.carriers.length >= MAX_ITEMS}
        onClick={() => set({ ...s, carriers: [...s.carriers, { id: newId(), providerId: "", name: "", available: "", mbps: null, leadDays: null, ip: "", entry: "", notes: "" }] })}
      >
        {t("carriers.add")}
      </AddButton>
    </div>
  )
}

export function PendingSection({ s, set }: SectionProps) {
  const t = useTranslations("levantamientos")
  const up = (id: string, x: Partial<Pending>) => set({ ...s, pending: patch(s.pending, id, x) })
  return (
    <div className="grid gap-3">
      <p className="text-sm leading-relaxed text-zinc-300">{t("pending.intro")}</p>
      {!s.pending.length && <p className="text-sm text-zinc-400">{t("pending.empty")}</p>}
      {s.pending.map((p, k) => (
        <ItemCard key={p.id} title={`${k + 1}. ${p.text || t("pending.text")}`} removeLabel={t("editor.remove")} onRemove={() => set({ ...s, pending: without(s.pending, p.id) })}>
          <AreaField label={t("pending.text")} value={p.text} onChange={(v) => up(p.id, { text: v })} rows={2} />
          <div className={GRID}>
            <PickField label={t("pending.who")} value={p.who} onChange={(v) => up(p.id, { who: v })} options={(["edificio", "nosotros"] as const).map((x) => ({ value: x, label: t(`pending.whos.${x}`) }))} />
            <label className="flex h-10 items-center gap-3 self-end text-sm text-zinc-200">
              <input type="checkbox" checked={p.done} onChange={(e) => up(p.id, { done: e.target.checked })} className="size-5 accent-white" />
              {t("pending.done")}
            </label>
          </div>
        </ItemCard>
      ))}
      <AddButton disabled={s.pending.length >= MAX_ITEMS} onClick={() => set({ ...s, pending: [...s.pending, { id: newId(), text: "", who: "edificio", done: false }] })}>
        {t("pending.add")}
      </AddButton>
    </div>
  )
}

/** What the provider list says about a carrier: coverage, offers and the first contact. */
function CarrierFromList({ p }: { p?: ReturnType<typeof providersSnapshot>["list"][number] }) {
  const t = useTranslations("levantamientos.carriers")
  if (!p) return null
  const contact = p.contacts[0]
  return (
    <div className="grid gap-1 rounded-lg border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-zinc-300">
      {p.carrier.zones && <p>{t("fromList", { zones: p.carrier.zones })}</p>}
      {p.carrier.offers
        .filter((o) => o.mbps)
        .map((o) => (
          <p key={o.id} className="font-mono">
            {t("offersLine", { mbps: o.mbps ?? 0, price: o.monthly === null ? "—" : mxn(o.monthly) })}
          </p>
        ))}
      {contact && <p>{t("contactLine", { name: contact.name, phone: contact.phone || contact.whatsapp || contact.email })}</p>}
    </div>
  )
}
