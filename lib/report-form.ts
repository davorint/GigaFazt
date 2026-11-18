import { z } from "zod"
import { REPORT_CATEGORIES } from "./reports/model"

/** Mexican phone: 10 digits, optionally prefixed by +52 / 52 / 044 / 045 (same rule as the contract form). */
const MX_PHONE = /^(?:\+?52|04[45])?\d{10}$/

/**
 * A client's problem report from the public form (/reportar). Shared by the form and /api/reportes so both validate
 * the same way. Error messages are i18n keys under `report.errors`.
 */
export const reportSchema = z.object({
  name: z.string().trim().min(2, "name").max(120, "name"),
  phone: z
    .string()
    .transform((v) => v.replace(/[\s\-().]/g, ""))
    .pipe(z.string().regex(MX_PHONE, "phone")),
  address: z.string().trim().min(3, "address").max(300, "address"),
  category: z.enum(REPORT_CATEGORIES, "category"),
  description: z.string().trim().max(1000, "description"),
  consent: z.literal(true, "consent"),
  /** Honeypot: humans never see or fill it. */
  website: z.string().max(0).optional(),
})

export type ReportInput = z.input<typeof reportSchema>
export type ReportForm = z.output<typeof reportSchema>
