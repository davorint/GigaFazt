/**
 * Contratos (/interno/admin/legal/contratos, owner 2026-11-21): every contract the business signs, in one register:
 * clients' service contracts, building agreements, carriers and suppliers, the team and anything else. Each one has
 * who it is with (a client, a deployment, a provider, or a typed name), its dates (signed, start, end), how it renews,
 * the notice period, an optional monthly amount, and the signed copies (PDF or photos, uploaded to the site:
 * lib/contracts/files.ts).
 *
 * Building agreements keep their dates where they already were, on each deployment (Despliegues → Acuerdo con el
 * edificio): a building contract tied to a deployment reads its end, renewal and notice from there, so there is one
 * date to keep up. Anything else carries its own dates here.
 *
 * Synced like the other sections (kind "contratos", table `contracts`). `decodeContract` never throws.
 */
import { newId } from "../survey/id"
import { day, idOf, isObj, money, pick, str } from "../finance/common"
import { agreementStatus, DEFAULT_NOTICE_DAYS, type AgreementStatus, type Site } from "../sites/model"

export const CONTRACT_KINDS = ["cliente", "edificio", "carrier", "proveedor", "equipo", "otro"] as const
export type ContractKind = (typeof CONTRACT_KINDS)[number]
export const RENEWALS = ["", "automatica", "negociar", "no"] as const
export type Renewal = (typeof RENEWALS)[number]

/** A signed copy kept in the database (the bytes are in `contract_files`; this is what the list shows). */
export type ContractFile = { id: string; name: string; size: number; mime: string; at: string; by: string }

export type Contract = {
  id: string
  kind: ContractKind
  /** What it is ("Servicio 500M", "Renta azotea", "Enlace 1 Gbps"). */
  title: string
  /** Who it's with when it isn't a client, deployment or provider in the lists. */
  party: string
  clientId: string
  siteId: string
  providerId: string
  /** The contract's own number or folio, if it has one. */
  number: string
  signedDate: string
  startDate: string
  endDate: string
  renewal: Renewal
  /** Days before the end to renew or give notice (null = DEFAULT_NOTICE_DAYS). */
  noticeDays: number | null
  /** MXN a month with IVA (0 = none or not recorded). */
  monthly: number
  /** Ended or cancelled before or at its end: no longer warns. */
  ended: boolean
  files: ContractFile[]
  notes: string
  by: string
  createdAt: string
  updatedAt: string
}

export function newContract(p: Partial<Contract> = {}): Contract {
  return { id: newId(), kind: "otro", title: "", party: "", clientId: "", siteId: "", providerId: "", number: "", signedDate: "", startDate: "", endDate: "", renewal: "", noticeDays: null, monthly: 0, ended: false, files: [], notes: "", by: "", createdAt: new Date().toISOString(), updatedAt: "", ...p }
}

/** A building contract tied to a deployment: its dates are the deployment's agreement. */
export const datesFromSite = (c: Pick<Contract, "kind" | "siteId">) => c.kind === "edificio" && !!c.siteId

export type ContractStatus = AgreementStatus | "terminado"

/**
 * Where a contract stands today: ended by hand, or by its end date and notice (same rule as the building agreements:
 * automatic renewal rolls the end a year at a time; inside the notice period it's "por vencer"). A building contract
 * tied to a deployment uses the deployment's agreement.
 */
export function contractStatus(c: Contract, sites: Pick<Site, "id" | "contractEnd" | "renewal" | "noticeDays">[], today: string) {
  if (c.ended) return { status: "terminado" as ContractStatus, end: c.endDate, daysLeft: null, noticeFrom: "" }
  if (datesFromSite(c)) {
    const s = sites.find((x) => x.id === c.siteId)
    if (s) return agreementStatus(s, today)
  }
  return agreementStatus({ contractEnd: c.endDate, renewal: c.renewal, noticeDays: c.noticeDays }, today)
}

export const noticeOf = (c: Pick<Contract, "noticeDays">) => c.noticeDays ?? DEFAULT_NOTICE_DAYS

// ── Reading stored or synced values ─────────────────────────────────────────

const MIMES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const

export function decodeFiles(v: unknown): ContractFile[] {
  if (!Array.isArray(v)) return []
  const out: ContractFile[] = []
  for (const f of v.filter(isObj).slice(0, MAX_FILES)) {
    const id = idOf(f.id)
    if (!id || out.some((x) => x.id === id)) continue
    out.push({ id, name: str(f.name, 160) || "archivo", size: typeof f.size === "number" && f.size > 0 ? Math.min(Math.round(f.size), 1e9) : 0, mime: pick(MIMES, f.mime, "application/pdf"), at: typeof f.at === "string" ? f.at.slice(0, 40) : "", by: str(f.by, 60) })
  }
  return out
}

/** Signed copies per contract. */
export const MAX_FILES = 20

export function decodeContract(v: unknown): Contract | null {
  if (!isObj(v)) return null
  const notice = typeof v.noticeDays === "number" && Number.isFinite(v.noticeDays) ? Math.min(Math.max(Math.round(v.noticeDays), 0), 730) : null
  return {
    id: idOf(v.id) || newId(),
    kind: pick(CONTRACT_KINDS, v.kind, "otro"),
    title: str(v.title, 200),
    party: str(v.party, 200),
    clientId: idOf(v.clientId),
    siteId: idOf(v.siteId),
    providerId: idOf(v.providerId),
    number: str(v.number, 80),
    signedDate: day(v.signedDate),
    startDate: day(v.startDate),
    endDate: day(v.endDate),
    renewal: pick(RENEWALS, v.renewal, ""),
    noticeDays: notice,
    monthly: money(v.monthly),
    ended: v.ended === true,
    files: decodeFiles(v.files),
    notes: str(v.notes, 4000),
    by: str(v.by, 60),
    createdAt: typeof v.createdAt === "string" ? v.createdAt.slice(0, 40) : "",
    updatedAt: typeof v.updatedAt === "string" ? v.updatedAt.slice(0, 40) : "",
  }
}
