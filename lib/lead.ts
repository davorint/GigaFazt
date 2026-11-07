import { z } from "zod"
import { addOns, plans } from "./plans"

const planIds = plans.map((p) => p.id) as [string, ...string[]]
const addOnIds = addOns.map((a) => a.id) as [string, ...string[]]

/** Today's date (YYYY-MM-DD) in Mexico City, not UTC. */
export function todayInMexico(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(now)
}

/** Mexican phone: 10 digits, optionally prefixed by +52 / 52 / 044 / 045. */
const MX_PHONE = /^(?:\+?52|04[45])?\d{10}$/

/**
 * Lead / contract request (SPEC "Conversion"). Shared by the client form and
 * /api/leads so both validate identically. Error messages are i18n keys under
 * `lead.errors`.
 */
export const leadSchema = z.object({
  name: z.string().trim().min(2, "name").max(120, "name"),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s\-().]/g, ""))
    .pipe(z.string().regex(MX_PHONE, "phone")),
  email: z.union([z.literal(""), z.email("email").max(200)]).optional(),
  address: z.string().trim().min(5, "address").max(300, "address"),
  planId: z.enum(planIds, "plan"),
  addOnIds: z.array(z.enum(addOnIds)).max(addOnIds.length),
  preferredDate: z
    .union([z.literal(""), z.iso.date("date")])
    .optional()
    .refine((v) => !v || v >= todayInMexico(), "date"),
  consent: z.literal(true, "consent"),
  /** Honeypot: humans never see or fill it. */
  website: z.string().max(0).optional(),
})

export type LeadInput = z.input<typeof leadSchema>
export type Lead = z.output<typeof leadSchema>
