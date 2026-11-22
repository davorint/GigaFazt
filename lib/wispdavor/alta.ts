/**
 * A new client in one step (WispDavor phase 12, owner 2026-11-22: "do all"): one form that makes the client with their
 * services, the installation in Agenda, the PPPoE user on the deployment's router, the OLT commands (DavorOLT's
 * "preautorizar") and the portal link with a welcome message. Pure rules here; the screen is components/wispdavor/AltaApp.
 */
import { newAppointment, type Appointment } from "../agenda/model"
import { DEFAULT_ONT, newClient, newService, type Client } from "../clients/model"
import { addOns, plans } from "../plans"
import type { Plan } from "../types"
import { normPort } from "../sites/model"
import { byPort, ontsOf } from "./red"

export type AltaInput = {
  name: string
  whatsapp: string
  siteId: string
  building: string
  tower: string
  apartment: string
  planId: string
  tv: boolean
  date: string
  time: string
  who: string
  pppoeUser: string
  ontModel: string
  ontSn: string
  oltPort: string
  ontId: string
}

export const emptyAlta = (): AltaInput => ({
  name: "",
  whatsapp: "",
  siteId: "",
  building: "",
  tower: "",
  apartment: "",
  planId: plans[0]?.id ?? "",
  tv: false,
  date: "",
  time: "",
  who: "",
  pppoeUser: "",
  ontModel: DEFAULT_ONT,
  ontSn: "",
  oltPort: "",
  ontId: "",
})

/** The router profile / Clientes plan name of a lineup plan ("200M", "1G"), as the routers name their profiles. */
export const profileOf = (p: Pick<Plan, "downMbps">) => (p.downMbps >= 1000 && p.downMbps % 1000 === 0 ? `${p.downMbps / 1000}G` : `${p.downMbps}M`)

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

/** A PPPoE user from the name and apartment ("ana.lopez.301"), unique among the clients' users (".2", ".3"… if taken). */
export function suggestUser(name: string, apartment: string, clients: Client[]): string {
  const words = name.trim().split(/\s+/).map(fold).filter(Boolean)
  const base = [words[0], words[1], fold(apartment)].filter(Boolean).join(".").slice(0, 40) || "cliente"
  const taken = new Set(clients.flatMap((c) => c.services.map((s) => s.pppoeUser.trim().toLowerCase())))
  if (!taken.has(base)) return base
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}.${i}`)) return `${base}.${i}`
  return `${base}.${Date.now() % 100000}`
}

/** The lowest free ONT ID on that OLT port (among the clients' ONTs); "" without a port. */
export function freeOntId(port: string, clients: Client[]): string {
  if (!port.trim()) return ""
  const row = byPort(ontsOf(clients)).find((r) => r.port === normPort(port))
  return String(row ? (row.nextFree ?? "") : 0)
}

/** The OLT ports already used at a deployment (to offer), most used first. */
export function sitePorts(siteId: string, clients: Client[]): string[] {
  return byPort(ontsOf(clients).filter((o) => o.siteId === siteId))
    .sort((a, b) => b.used - a.used)
    .map((r) => r.port)
}

export type AltaProblem = "name" | "whatsapp" | "site" | "plan" | "date" | "user" | "userTaken" | "snTaken" | "idTaken" | "port" | "ontId"

/** What stops the form (empty = it can go). */
export function problems(i: AltaInput, clients: Client[]): AltaProblem[] {
  const out: AltaProblem[] = []
  if (!i.name.trim()) out.push("name")
  if (i.whatsapp.replace(/\D/g, "").length < 10) out.push("whatsapp")
  if (!i.siteId) out.push("site")
  if (!plans.some((p) => p.id === i.planId)) out.push("plan")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date)) out.push("date")
  const user = i.pppoeUser.trim()
  if (!/^[\w.@-]{3,64}$/.test(user)) out.push("user")
  const services = clients.flatMap((c) => c.services.filter((s) => s.status !== "cancelado"))
  if (user && services.some((s) => s.pppoeUser.trim().toLowerCase() === user.toLowerCase())) out.push("userTaken")
  const sn = i.ontSn.trim().toUpperCase()
  if (sn && services.some((s) => s.ontSn.trim().toUpperCase() === sn)) out.push("snTaken")
  if (i.oltPort.trim() && !/^\d{1,2}\/\d{1,2}\/\d{1,3}$/.test(normPort(i.oltPort))) out.push("port")
  if (i.ontId.trim() && !(/^\d{1,3}$/.test(i.ontId.trim()) && Number(i.ontId) <= 127)) out.push("ontId")
  if (i.oltPort.trim() && i.ontId.trim() && services.some((s) => s.oltPort && normPort(s.oltPort) === normPort(i.oltPort) && s.ontId === Number(i.ontId))) out.push("idTaken")
  return out
}

/**
 * The client (internet at the plan's price, TV if asked) and the installation appointment. The services start on the
 * installation day (Cobranza: charged that month if installed by the 15th).
 */
export function buildAlta(i: AltaInput, by: string, now = new Date().toISOString()): { client: Client; appointment: Appointment } {
  const plan = plans.find((p) => p.id === i.planId)!
  const tvPrice = addOns.find((a) => a.id === "tv")?.priceMxn
  const internet = newService("internet", {
    plan: profileOf(plan),
    monthly: typeof plan.priceMxn === "number" ? plan.priceMxn : null,
    start: i.date,
    status: "activo",
    pppoeUser: i.pppoeUser.trim(),
    ontModel: i.ontModel.trim(),
    ontSn: i.ontSn.trim().toUpperCase(),
    oltPort: i.oltPort.trim() ? normPort(i.oltPort) : "",
    ontId: i.ontId.trim() ? Number(i.ontId) : null,
  })
  const services = [internet, ...(i.tv ? [newService("iptv", { plan: "TV", monthly: typeof tvPrice === "number" ? tvPrice : null, start: i.date, status: "activo" })] : [])]
  const client = newClient({
    name: i.name.trim(),
    whatsapp: i.whatsapp.trim(),
    phone: i.whatsapp.trim(),
    siteId: i.siteId,
    building: i.building.trim(),
    tower: i.tower.trim(),
    apartment: i.apartment.trim(),
    services,
    createdAt: now,
    updatedAt: now,
  })
  const appointment = newAppointment({
    kind: "instalacion",
    date: i.date,
    time: i.time,
    who: i.who.trim(),
    status: "pendiente",
    clientId: client.id,
    siteId: i.siteId,
    name: client.name,
    phone: client.whatsapp,
    address: [client.building, client.tower, client.apartment].filter(Boolean).join(" · "),
    notes: [`Alta: ${profileOf(plan)}${i.tv ? " + TV" : ""}`, `PPPoE ${internet.pppoeUser}`, internet.ontSn && `ONT ${internet.ontSn}`, internet.oltPort && `OLT ${internet.oltPort}${internet.ontId !== null ? ` #${internet.ontId}` : ""}`].filter(Boolean).join(" · "),
    by,
    createdAt: now,
    updatedAt: now,
  })
  return { client, appointment }
}

/** DavorOLT's values for "preautorizar" (the OLT plan with the same speed; null when the OLT has no such plan). */
export function oltValues(i: AltaInput, oltPlans: { mbps: number }[], pppoe: { user: string; pass: string } | null): Record<string, string> | null {
  const plan = plans.find((p) => p.id === i.planId)
  const k = plan ? oltPlans.findIndex((p) => p.mbps === plan.downMbps) : -1
  const parts = normPort(i.oltPort).split("/")
  if (k < 0 || parts.length !== 3 || !i.ontSn.trim() || !i.ontId.trim()) return null
  return {
    slot: parts[1],
    port: parts[2],
    ontId: i.ontId.trim(),
    sn: i.ontSn.trim().toUpperCase(),
    desc: `${i.name.trim()} ${i.apartment.trim()}`.trim().slice(0, 60),
    plan: String(k),
    spIndex: "",
    pppoeUser: pppoe?.user ?? "",
    pppoePass: pppoe?.pass ?? "",
    iptv: "no",
    iptvIndex: "",
  }
}
