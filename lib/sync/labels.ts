/** A short name for any synced record, for the history and "Borrados recientemente" lists. */
import { clientLabel, decodeClient } from "../clients/model"
import { decodeItem } from "../materials/catalog"
import { decodeNote } from "../notes/model"
import { decodePayment } from "../payments/model"
import { decodeRoll } from "../rolls/model"
import { buyLabel, decodeToolBuy } from "../toolbuys/model"
import { decodeAppointment } from "../agenda/model"
import { decodeProvider, providerName } from "../providers/model"
import { decodeReport, reportCode } from "../reports/model"
import { decodeSite, siteLabel } from "../sites/model"
import { decodeMove, decodeUnit } from "../stock/model"
import { decodeSurvey } from "../survey/model"
import { decodeTool, toolLabel } from "../tools/model"
import type { SyncKind } from "./protocol"

export function recordLabel(kind: SyncKind, data: unknown): string {
  switch (kind) {
    case "clients": {
      const c = decodeClient(data)
      return c ? clientLabel(c) : "—"
    }
    case "sites": {
      const s = decodeSite(data)
      return s ? siteLabel(s) : "—"
    }
    case "tools": {
      const x = decodeTool(data)
      return x ? toolLabel(x) : "—"
    }
    case "providers": {
      const p = decodeProvider(data)
      return (p && providerName(p)) || "—"
    }
    case "materials":
      return decodeItem(data)?.name || "—"
    case "surveys":
      return decodeSurvey(data)?.ident.name || "—"
    case "reports": {
      const r = decodeReport(data)
      return r ? [reportCode(r), r.name].filter(Boolean).join(" · ") : "—"
    }
    case "payments": {
      const p = decodePayment(data)
      return p ? `${p.date} · $${p.amount.toLocaleString("es-MX")}` : "—"
    }
    case "notes": {
      const n = decodeNote(data)
      return n ? n.title || n.body.slice(0, 60) || "—" : "—"
    }
    case "stock": {
      const m = decodeMove(data)
      return m ? `${m.date} · ${m.kind} · ${m.qty}` : "—"
    }
    case "rolls": {
      const r = decodeRoll(data)
      return r ? `${r.code || "—"} · ${r.leftM}/${r.lengthM} m` : "—"
    }
    case "toolbuys": {
      const b = decodeToolBuy(data)
      return b ? `${b.need || "—"} · ${buyLabel(b)} · ${b.status}` : "—"
    }
    case "agenda": {
      const a = decodeAppointment(data)
      return a ? `${a.date} ${a.time} · ${a.kind} · ${a.name || "—"}` : "—"
    }
    case "units":
      return decodeUnit(data)?.serial || "—"
  }
}
