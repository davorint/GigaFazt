/** A website request turned into a residential client: contact, address as the building, an internet service with the plan and its price, and an IPTV service when TV was asked for. */
import { getAddOn, getPlan } from "../plans"
import { speedLabel } from "../format"
import { newClient, newService, type Client } from "./model"

export type LeadLike = { id: string; name: string; phone: string; email: string; address: string; planId: string; addOnIds: string[] }

/** Today on this phone's clock (not UTC: after 6 p.m. in Mexico the UTC date is already tomorrow). */
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const price = (x: unknown) => (typeof x === "number" ? x : null)

export function clientFromLead(l: LeadLike, today = localToday()): Client {
  const plan = getPlan(l.planId)
  const services = [newService("internet", { plan: plan ? speedLabel(plan.downMbps) : l.planId, monthly: plan ? price(plan.priceMxn) : null, start: today })]
  if (l.addOnIds.includes("tv")) services.push(newService("iptv", { plan: "TV", monthly: price(getAddOn("tv")?.priceMxn), start: today }))
  return newClient({ kind: "residencial", name: l.name, phone: l.phone, whatsapp: l.phone, email: l.email, building: l.address, services, leadId: l.id })
}
