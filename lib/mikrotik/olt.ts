/**
 * Huawei OLT models the owner runs (MA5608T, MA5683T…) or plans to buy
 * (MA5800), with the limits the capacity model checks. One OLT per
 * deployment, with its own router (owner, 2026-11-15). Slots and most PON ports
 * from Huawei's documents (the same ones /olt cites): the MA5600T datasheet
 * (MA5608T 32 GPON / 8 10G GPON, MA5603T = MA5683T 96 / 48; XG-PON board
 * H802XGBC in the MA5600T/MA5603T/MA5608T Hardware Description) and the
 * MA5800-X17/X15/X7/X2 Product Datasheet (2023). Most users: a third-party
 * comparison table (128 ONTs per port). XGS-PON is MA5800 only.
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
}

export const OLT_MODELS: OltModelId[] = ["ma5608t", "ma5683t", "ma5800x2", "ma5800x7", "ma5800x15", "ma5800x17", "other"]

export const OLT_SPECS: Record<OltModelId, OltSpec> = {
  // 10G GPON (XG-PON) per Huawei's MA5600T datasheet: 8 on the MA5608T (2 slots × the 4-port H802XGBC), 48 on the MA5603T/MA5683T.
  ma5608t: { slots: 2, maxPorts: { gpon: 32, xgpon: 8, xgspon: 0 }, maxUsers: 4096 },
  ma5683t: { slots: 6, maxPorts: { gpon: 96, xgpon: 48, xgspon: 0 }, maxUsers: 12288 },
  // MA5800: GPON, XG-PON and XGS-PON alike (16 ports per slot), Huawei datasheet 2023.
  ma5800x2: { slots: 2, maxPorts: { gpon: 32, xgpon: 32, xgspon: 32 }, maxUsers: 4096 },
  ma5800x7: { slots: 7, maxPorts: { gpon: 112, xgpon: 112, xgspon: 112 }, maxUsers: 14336 },
  ma5800x15: { slots: 15, maxPorts: { gpon: 240, xgpon: 240, xgspon: 240 }, maxUsers: 30720 },
  ma5800x17: { slots: 17, maxPorts: { gpon: 272, xgpon: 272, xgspon: 272 }, maxUsers: 34816 },
  other: { slots: null, maxPorts: { gpon: null, xgpon: null, xgspon: null }, maxUsers: null },
}

/** The deployment's OLT. uplinkMbps 0 = no limit. */
export type OltEntry = { model: OltModelId; tech: OltTech; homesPerPort: number; uplinkMbps: number }

export type OltIssueCode =
  /** The model has no boards for this PON type (XGS-PON on the MA5600T family). */
  | "unsupported"
  /** The clients need more ports than the model takes. */
  | "tooManyPorts"
  | "tooManyHomes"
  | "tooManyUsers"
  | "noUplink"

export type OltIssue = { code: OltIssueCode; level: "error" | "warn" | "info"; max?: number; need?: number }

/** PON ports the clients use at `homesPerPort` each. */
export const portsNeeded = (clients: number, homesPerPort: number) => (clients > 0 ? Math.ceil(clients / Math.max(1, Math.round(homesPerPort))) : 0)

/** `ports`: the ports in use when known (a deployment that already runs); otherwise what the clients need. */
export function checkOlt(o: OltEntry, clients: number, ports?: number): OltIssue[] {
  const spec = OLT_SPECS[o.model]
  const out: OltIssue[] = []
  const max = spec.maxPorts[o.tech]
  const need = ports ?? portsNeeded(clients, o.homesPerPort)
  if (max === 0) out.push({ code: "unsupported", level: "error" })
  else if (max !== null && need > max) out.push({ code: "tooManyPorts", level: "error", max, need })
  if (o.homesPerPort > MAX_HOMES_PER_PORT) out.push({ code: "tooManyHomes", level: "error", max: MAX_HOMES_PER_PORT })
  if (spec.maxUsers !== null && clients > spec.maxUsers) out.push({ code: "tooManyUsers", level: "warn", max: spec.maxUsers })
  if (!(o.uplinkMbps > 0)) out.push({ code: "noUplink", level: "info" })
  return out
}
