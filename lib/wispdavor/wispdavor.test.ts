import { describe, expect, it, vi } from "vitest"
import { newClient, newService } from "../clients/model"
import { newPayment } from "../payments/model"
import { bySite, cutCommands, cutLists, markServices } from "./cortes"
import { mapSites, toneOf } from "./mapa"
import { TEMPLATES, TEMPLATE_IDS, cleanParam, fill, waNumber } from "./whatsapp"
import { WISPDAVOR_PAGES } from "./pages"
import { matchInternal } from "../internal-pages"

vi.mock("server-only", () => ({}))

const TODAY = "2026-11-21"
// Billing since September: due day 1, late on the 11th (Cobranza).
const client = (id: string, p: Parameters<typeof newClient>[0] = {}, s: Partial<ReturnType<typeof newService>> = {}) =>
  newClient({ id, name: `Cliente ${id}`, phone: "55 1234 5678", siteId: "site-001", billingFrom: "2026-09", services: [newService("internet", { id: `${id}-s`, monthly: 396, plan: "200M", pppoeUser: `u${id}`, start: "2026-09-01", ...s })], ...p })
const paid = (clientId: string, amount: number) => newPayment({ clientId, date: "2026-11-02", amount, method: "transferencia" })

describe("WispDavor cut-offs (owner, 2026-11-21)", () => {
  const late = client("a01")
  const promised = client("b02", { promiseDate: "2026-11-25" })
  const noUser = client("c03", {}, { pppoeUser: "" })
  const back = client("d04", {}, { status: "suspendido" })
  const stillLate = client("e05", {}, { status: "suspendido" })
  const payments = [paid("a01", 396), paid("b02", 396), paid("c03", 396), paid("d04", 396 * 3), paid("e05", 396)]
  const lists = cutLists([late, promised, noUser, back, stillLate], payments, TODAY)

  it("cut the late without a standing promise; promises and services without a PPPoE user apart; reconnect who paid", () => {
    expect(lists.cut.map((r) => r.clientId)).toEqual(["a01"])
    expect(lists.promised.map((r) => r.clientId)).toEqual(["b02"])
    expect(lists.noUser.map((r) => r.clientId)).toEqual(["c03"])
    expect(lists.restore.map((r) => r.clientId)).toEqual(["d04"])
    expect(lists.cut[0]).toMatchObject({ user: "ua01", owed: 792 })
  })

  it("MikroTik commands: suspended profile, or back to the plan, dropping the session", () => {
    expect(cutCommands("suspend", lists.cut).script).toBe('/ppp secret set [find where name="ua01"] profile="DSX-suspendido"\n/ppp active remove [find where name="ua01"]')
    expect(cutCommands("restore", lists.restore).script).toContain('profile="200M"')
    expect(bySite(lists.cut).get("site-001")).toHaveLength(1)
  })

  it("marking changes only those services", () => {
    const [m] = markServices([late, back], lists.cut, "suspendido")
    expect(m.id).toBe("a01")
    expect(m.services[0].status).toBe("suspendido")
  })
})

describe("WispDavor WhatsApp notices", () => {
  it("Mexican numbers as WhatsApp takes them", () => {
    expect(waNumber("55 1234 5678")).toBe("525512345678")
    expect(waNumber("+52 1 55 1234 5678")).toBe("525512345678")
    expect(waNumber("+52 55 1234 5678")).toBe("525512345678")
    expect(waNumber("1234")).toBeNull()
  })
  it("the four templates fill their variables in order; Meta's rules on variables", () => {
    expect(TEMPLATE_IDS.map((id) => TEMPLATES[id].name)).toEqual(["gigafazt_recordatorio_pago", "gigafazt_aviso_corte", "gigafazt_reconexion", "gigafazt_mantenimiento", "gigafazt_pago_recibido", "gigafazt_cobro_fallido", "gigafazt_reporte_actualizado", "gigafazt_bienvenida"])
    for (const id of TEMPLATE_IDS) expect(TEMPLATES[id].body.match(/\{\{\d+\}\}/g)?.length ?? 0).toBe(TEMPLATES[id].params.length)
    expect(fill("reconexion", ["Ana"])).toBe("Hola Ana, recibimos tu pago y tu servicio de internet GigaFazt ya está activo. Si no tienes conexión, reinicia tu módem. ¡Gracias!")
    expect(cleanParam("a\nb\tc      d")).toBe("a b c   d")
  })
})

describe("WispDavor map and pages", () => {
  it("each deployment at its survey's point, with its clients", () => {
    const site = { id: "site-001", name: "Los Pinos" } as never
    const survey = { siteId: "site-001", ident: { lat: 19.4, lng: -99.1 } } as never
    const [s] = mapSites([site], [survey], [client("a01"), client("d04", {}, { status: "suspendido" })], [], TODAY)
    expect(s).toMatchObject({ lat: 19.4, lng: -99.1, clients: 2, suspended: 1 })
    expect(toneOf(s)).toBe("suspended")
  })
  it("subfolders: any capitalization of a WispDavor page", () => {
    expect(WISPDAVOR_PAGES).toEqual(["alta", "cortes", "portal", "avisos", "mapa", "pagos", "facturas", "routers", "trafico", "hotspot", "monitoreo", "cobranza", "envivo", "red", "capacidad", "tunel", "contrato"])
    expect(matchInternal("/Interno/Software/WispDavor/Cortes")).toEqual({ rewriteTo: "/es/interno/software/wispdavor/cortes", open: false })
  })
})

describe("WispDavor client portal", () => {
  it("shows only the client's own balance, services, payments; never notes", async () => {
    const { view } = await import("./portal-server")
    const c = client("a01", { notes: "nota interna", building: "Torre Norte", apartment: "402" })
    const v = view(c, [paid("a01", 396)], [], TODAY)
    expect(v).toMatchObject({ firstName: "Cliente", place: "Torre Norte · 402", balance: { status: "atrasado", owed: 792 } })
    expect(v.services).toEqual([{ type: "internet", plan: "200M", monthly: 396, status: "activo" }])
    expect(JSON.stringify(v)).not.toContain("nota interna")
  })
})
