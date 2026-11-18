/** A website request turned into a client: contact, address as the building, plan, TV and the monthly price from the site's plans. */
import { getAddOn, getPlan } from "../plans"
import { speedLabel } from "../format"
import { newClient, type Client } from "./model"

export type LeadLike = { id: string; name: string; phone: string; email: string; address: string; planId: string; addOnIds: string[] }

/** Today on this phone's clock (not UTC: after 6 p.m. in Mexico the UTC date is already tomorrow). */
export const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export function clientFromLead(l: LeadLike, today = localToday()): Client {
  const plan = getPlan(l.planId)
  const tv = l.addOnIds.includes("tv")
  const price = (x: unknown) => (typeof x === "number" ? x : 0)
  const monthly = plan ? price(plan.priceMxn) + (tv ? price(getAddOn("tv")?.priceMxn) : 0) : null
  return newClient({
    name: l.name,
    phone: l.phone,
    whatsapp: l.phone,
    email: l.email,
    building: l.address,
    plan: plan ? speedLabel(plan.downMbps) : l.planId,
    tv,
    installDate: today,
    monthly: monthly || null,
    leadId: l.id,
  })
}
