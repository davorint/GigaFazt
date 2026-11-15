/**
 * Huawei OLT models the owner runs (MA5608T, MA5683T…) or plans to buy
 * (MA5800), with the limits the capacity model checks. One OLT per
 * deployment, with its own router (owner, 2026-11-15). Source: a Huawei OLT
 * comparison table (third-party Google Sheets export, "Huawei OLT's
 * comparision"): service slots, most GPON / XG-PON / XGS-PON ports, most
 * users. XG-PON on the MA5600T family (MA5608T, MA5683T) appears only in a
 * distributor's board list (XGBC 4-port, XGBD 8-port), not in that table:
 * flagged as unconfirmed. XGS-PON is MA5800 only.
 */

import { MAX_HOMES_PER_PORT } from "./capacity"

export type OltModelId = "ma5608t" | "ma5683t" | "ma5800x2" | "ma5800x7" | "ma5800x15" | "ma5800x17" | "other"
export type OltTech = "gpon" | "xgpon" | "xgspon"

export type OltSpec = {
  /** Service slots for PON boards (null = unknown / other model). */
  slots: number | null
  /** Most ports per technology; 0 = not supported; null = no check. */
  maxPorts: Record<OltTech, number | null>
  /** Most users (ONTs) the chassis takes. */
  maxUsers: number | null
  /** XG-PON listed by a distributor only. */
  xgponUnconfirmed: boolean
}

export const OLT_MODELS: OltModelId[] = ["ma5608t", "ma5683t", "ma5800x2", "ma5800x7", "ma5800x15", "ma5800x17", "other"]

export const OLT_SPECS: Record<OltModelId, OltSpec> = {
  // 2 slots × 8-port XGBD boards = 16 XG-PON ports, if the distributor's list holds.
  ma5608t: { slots: 2, maxPorts: { gpon: 32, xgpon: 16, xgspon: 0 }, maxUsers: 4096, xgponUnconfirmed: true },
  ma5683t: { slots: 6, maxPorts: { gpon: 96, xgpon: 48, xgspon: 0 }, maxUsers: 12288, xgponUnconfirmed: true },
  ma5800x2: { slots: 2, maxPorts: { gpon: 32, xgpon: 32, xgspon: 16 }, maxUsers: 4096, xgponUnconfirmed: false },
  ma5800x7: { slots: 7, maxPorts: { gpon: 112, xgpon: 112, xgspon: 136 }, maxUsers: 14336, xgponUnconfirmed: false },
  ma5800x15: { slots: 16, maxPorts: { gpon: 240, xgpon: 240, xgspon: 120 }, maxUsers: 30720, xgponUnconfirmed: false },
  ma5800x17: { slots: 17, maxPorts: { gpon: 272, xgpon: 272, xgspon: 136 }, maxUsers: 34816, xgponUnconfirmed: false },
  other: { slots: null, maxPorts: { gpon: null, xgpon: null, xgspon: null }, maxUsers: null, xgponUnconfirmed: false },
}

/** The deployment's OLT. uplinkMbps 0 = no limit. */
export type OltEntry = { model: OltModelId; tech: OltTech; homesPerPort: number; uplinkMbps: number }

export type OltIssueCode =
  /** The model has no boards for this PON type (XGS-PON on the MA5600T family). */
  | "unsupported"
  /** Only a distributor lists it (XG-PON on the MA5600T family). */
  | "unconfirmed"
  /** The clients need more ports than the model takes. */
  | "tooManyPorts"
  | "tooManyHomes"
  | "tooManyUsers"
  | "noUplink"

export type OltIssue = { code: OltIssueCode; level: "error" | "warn" | "info"; max?: number; need?: number }

/** PON ports the clients use at `homesPerPort` each. */
export const portsNeeded = (clients: number, homesPerPort: number) => (clients > 0 ? Math.ceil(clients / Math.max(1, Math.round(homesPerPort))) : 0)

export function checkOlt(o: OltEntry, clients: number): OltIssue[] {
  const spec = OLT_SPECS[o.model]
  const out: OltIssue[] = []
  const max = spec.maxPorts[o.tech]
  const need = portsNeeded(clients, o.homesPerPort)
  if (max === 0) out.push({ code: "unsupported", level: "error" })
  else {
    if (o.tech === "xgpon" && spec.xgponUnconfirmed) out.push({ code: "unconfirmed", level: "warn" })
    if (max !== null && need > max) out.push({ code: "tooManyPorts", level: "error", max, need })
  }
  if (o.homesPerPort > MAX_HOMES_PER_PORT) out.push({ code: "tooManyHomes", level: "error", max: MAX_HOMES_PER_PORT })
  if (spec.maxUsers !== null && clients > spec.maxUsers) out.push({ code: "tooManyUsers", level: "warn", max: spec.maxUsers })
  if (!(o.uplinkMbps > 0)) out.push({ code: "noUplink", level: "info" })
  return out
}
