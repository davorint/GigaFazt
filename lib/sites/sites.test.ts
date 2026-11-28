import { describe, expect, it } from "vitest"
import { decodeClient, newClient, newService } from "../clients/model"
import { matchInternal } from "../internal-pages"
import { decodeSite, newEquipment, newPort, newRoom, newSite, newTower, normPort, removeRoom, removeTower, roomCapacity, siteCost, linksCost, unpricedLinks, siteProfit, newRoomCarrier } from "./model"
import { portClients, siteStats } from "./stats"

/** A location with two telecom rooms: room A serves towers 1–2, room B serves tower 3; both have a port 0/1/0. */
function twoRooms() {
  const a = newRoom({ name: "Cuarto A", ports: [newPort({ port: "0/1/0" }), newPort({ port: "0/1/1" })], carriers: [] })
  const b = newRoom({ name: "Cuarto B", ports: [newPort({ port: "0/1/0" })] })
  const t1 = newTower({ name: "Torre 1", roomId: a.id, apartments: 40 })
  const t2 = newTower({ name: "Torre 2", roomId: a.id, apartments: 40 })
  const t3 = newTower({ name: "Torre 3", roomId: b.id, apartments: 20 })
  return { s: newSite({ name: "Conjunto", rooms: [a, b], towers: [t1, t2, t3] }), a, b, t1, t2, t3 }
}
const client = (siteId: string, towerId: string, oltPort: string, p: { status?: "activo" | "suspendido" | "cancelado"; monthly?: number } = {}) =>
  newClient({ siteId, towerId, services: [newService("internet", { oltPort, status: p.status ?? "activo", monthly: p.monthly ?? 496 })] })

describe("locations", () => {
  it("a new location starts with one telecom room", () => {
    expect(newSite().rooms.map((r) => r.name)).toEqual(["Cuarto principal"])
  })
  it("clients per tower, active, monthly total; clients of other locations ignored", () => {
    const { s, t1, t3 } = twoRooms()
    const list = [client(s.id, t1.id, "0/1/0"), client(s.id, t1.id, "0/1/0", { status: "suspendido" }), client(s.id, t3.id, "0/1/0", { monthly: 596 }), client(s.id, "", ""), client("otro-sitio", t1.id, "0/1/0")]
    const st = siteStats(s, list)
    expect([st.clients, st.active, st.monthly, st.noTower]).toEqual([4, 3, 496 + 596 + 496, 1])
    expect(st.byTower[t1.id]).toEqual({ clients: 2, active: 1 })
    expect(st.byTower[t3.id]).toEqual({ clients: 1, active: 1 })
  })
  it("clients per PON port: the same port name in two rooms is told apart by the client's tower; typing differences ignored; cancelled not counted", () => {
    const { s, a, b, t1, t2, t3 } = twoRooms()
    const list = [client(s.id, t1.id, "0/1/0"), client(s.id, t2.id, "0-1-0"), client(s.id, t2.id, "0 / 1 / 1"), client(s.id, t3.id, "0/1/0"), client(s.id, t1.id, "0/1/0", { status: "cancelado" }), client(s.id, "", "0/1/0")]
    const ca = portClients(s, a, list)
    const cb = portClients(s, b, list)
    expect([ca[a.ports[0].id], ca[a.ports[1].id], cb[b.ports[0].id]]).toEqual([2, 1, 1])
  })
  it("with a single room, clients without a tower count on its ports", () => {
    const room = newRoom({ ports: [newPort({ port: "0/2/3" })] })
    const s = newSite({ rooms: [room] })
    expect(portClients(s, room, [client(s.id, "", "0/2/3")])[room.ports[0].id]).toBe(1)
    expect(normPort(" 0.2.3 ")).toBe("0/2/3")
  })
  it("removing a room clears the towers it served; removing a tower clears its ports", () => {
    const { s, a, t1, t3 } = twoRooms()
    const p = { ...s, rooms: s.rooms.map((r) => (r.id === a.id ? { ...r, ports: r.ports.map((x) => ({ ...x, towerId: t1.id })) } : r)) }
    expect(removeRoom(p, a.id).towers.map((x) => x.roomId)).toEqual(["", "", t3.roomId])
    expect(removeTower(p, t1.id).rooms[0].ports.map((x) => x.towerId)).toEqual(["", ""])
  })
  it("cost: rent plus electricity only when we pay it; carrier capacity", () => {
    expect(siteCost(newSite({ rentMonthly: 3000, powerMonthly: 800, powerPayer: "nosotros" }))).toBe(3800)
    expect(siteCost(newSite({ rentMonthly: 3000, powerMonthly: 800, powerPayer: "edificio" }))).toBe(3000)
    expect(roomCapacity(newRoom())).toBeNull()
    const room = newRoom({ carriers: [newRoomCarrier({ name: "A", downMbps: 1000, upMbps: 1000, monthly: 2500 }), newRoomCarrier({ name: "B", downMbps: 500 })] })
    expect(roomCapacity(room)).toBe(1500)
    // Profit: income − building − links (an unpriced link counts as 0 and is reported).
    const site = newSite({ rentMonthly: 3000, powerMonthly: 800, powerPayer: "nosotros", rooms: [room] })
    expect(linksCost(site)).toBe(2500)
    expect(unpricedLinks(site)).toBe(1)
    expect(siteProfit(site, 20000)).toBe(20000 - 3800 - 2500)
  })
  it("reads stored values leniently; references to removed towers, rooms or OLTs read as not set", () => {
    const olt = newEquipment("olt", { serial: "abc" })
    const room = newRoom({ equipment: [olt, { kind: "nave" } as never], ports: [newPort({ towerId: "no-existe-1", oltId: olt.id }), newPort({ oltId: "otra-olt-1" })] })
    const s = decodeSite({ ...newSite({ rooms: [room], towers: [newTower({ roomId: "cuarto-viejo" })] }), powerPayer: "nadie", rentMonthly: -5, contractEnd: "31/12/2026" })!
    expect(s.towers[0].roomId).toBe("")
    expect(s.rooms[0].equipment.map((e) => [e.kind, e.serial])).toEqual([
      ["olt", "ABC"],
      ["otro", ""],
    ])
    expect(s.rooms[0].ports.map((p) => [p.towerId, p.oltId])).toEqual([
      ["", olt.id],
      ["", ""],
    ])
    expect([s.powerPayer, s.rentMonthly, s.contractEnd]).toEqual(["", null, ""])
    expect(decodeSite(null)).toBeNull()
    expect(decodeClient({ siteId: "x", towerId: "torre-1234" })).toMatchObject({ siteId: "", towerId: "torre-1234" })
  })
  it("/interno/admin/despliegues, and /interno/admin/deployments opens it", () => {
    expect(matchInternal("/interno/admin/Despliegues")?.rewriteTo).toBe("/es/interno/admin/despliegues")
    expect(matchInternal("/INTERNO/admin/deployments")?.rewriteTo).toBe("/es/interno/admin/despliegues")
  })
})

describe("building agreements (owner, 2026-11-19)", () => {
  it("in force, in its notice period, ended, no date; an automatic renewal rolls a year at a time", async () => {
    const { agreementStatus, decodeSite, newSite } = await import("./model")
    const at = (p: object) => agreementStatus(newSite(p), "2026-11-19")
    expect(at({}).status).toBe("sin-fecha")
    expect(at({ contractEnd: "2027-06-30" })).toMatchObject({ status: "vigente", noticeFrom: "2027-05-01" })
    expect(at({ contractEnd: "2026-12-31" })).toMatchObject({ status: "por-vencer", daysLeft: 42 })
    expect(at({ contractEnd: "2027-03-01", noticeDays: 120 }).status).toBe("por-vencer")
    expect(at({ contractEnd: "2026-11-01" })).toMatchObject({ status: "vencido", end: "2026-11-01" })
    expect(at({ contractEnd: "2024-02-29", renewal: "automatica" })).toMatchObject({ status: "renovado", end: "2027-02-28" })
    expect(at({ contractEnd: "2025-12-01", renewal: "automatica" })).toMatchObject({ status: "por-vencer", end: "2026-12-01" })
    const back = decodeSite(JSON.parse(JSON.stringify(newSite({ renewal: "negociar", noticeDays: 90, rentIncreasePct: 5 }))))!
    expect([back.renewal, back.noticeDays, back.rentIncreasePct]).toEqual(["negociar", 90, 5])
    expect(decodeSite({ ...newSite(), renewal: "x" })!.renewal).toBe("")
  })
})

describe("cancel reasons and agreements on Hoy (owner, 2026-11-19)", () => {
  it("a cancellation keeps its reason and note; reactivating drops them", () => {
    const c = newClient({ services: [newService("internet", { status: "cancelado", cancelledAt: "2026-10-01", cancelReason: "competencia", cancelNote: "Se fue con otro" })] })
    const back = decodeClient(JSON.parse(JSON.stringify(c)))!
    expect([back.services[0].cancelReason, back.services[0].cancelNote]).toEqual(["competencia", "Se fue con otro"])
    const on = decodeClient(JSON.parse(JSON.stringify({ ...c, services: [{ ...c.services[0], status: "activo" }] })))!
    expect([on.services[0].cancelReason, on.services[0].cancelNote]).toEqual(["", ""])
  })
  it("Hoy lists agreements ended or in their notice period", async () => {
    const { todaySummary, allClear } = await import("../interno/today")
    const { newSite } = await import("./model")
    const base = { reports: [], clients: [], payments: [], tools: [], items: [], moves: [], units: [], notes: [] }
    const s = todaySummary({ ...base, sites: [newSite({ name: "Torre A", contractEnd: "2026-12-15" }), newSite({ name: "Torre B", contractEnd: "2028-01-01" }), newSite({ name: "Torre C", contractEnd: "2026-10-01" })] }, "2026-11-19")
    expect(s.agreements.map((a) => [a.label, a.ended])).toEqual([["Torre C", true], ["Torre A", false]])
    expect(allClear(s)).toBe(false)
  })
})

describe("deployment state and municipality menus (owner, 2026-11-20)", () => {
  it("keeps the state; older deployments get it from a listed municipality, typed ones stay as written", async () => {
    const { decodeSite, newSite } = await import("./model")
    const old = JSON.parse(JSON.stringify(newSite({ municipality: "Naucalpan de Juárez" })))
    delete old.state
    expect(decodeSite(old)!.state).toBe("Estado de México")
    expect(decodeSite({ ...old, municipality: "Metepec" })!.state).toBe("")
    expect(decodeSite({ ...old, state: "Querétaro", municipality: "El Marqués" })).toMatchObject({ state: "Querétaro", municipality: "El Marqués" })
  })
})

describe("a survey becomes a deployment (owner, 2026-11-20)", () => {
  it("carries name, place, towers with apartments, contacts, access, rent and power, the room and available carriers", async () => {
    const { newSurvey, emptyTower, decodeSurvey } = await import("../survey/model")
    const { siteFromSurvey } = await import("./from-survey")
    const s = newSurvey("Torre A")
    s.ident = { ...s.ident, name: "Residencial Sur", address: "Calle 1", municipality: "Coyoacán", state: "Ciudad de México" }
    const t = { ...emptyTower("Torre B"), floorsAbove: 3, floors: [0, 1, 2].map((level) => ({ ...emptyTower("x").floors[0], level, units: 4 })) }
    s.towers = [t]
    s.contacts = [{ id: "c-000001", role: "administrador", name: "Rosa", phone: "551", email: "", notes: "" }, { id: "c-000002", role: "otro", name: "", phone: "", email: "", notes: "" }]
    s.permits = { ...s.permits, workHours: "9 a 18", accessRules: "Con gafete", rules: "Sin ruido" }
    s.commercial = { ...s.commercial, rentMonthly: 2500, powerMonthly: 400, powerPaidBy: "pendiente", notes: "Exclusividad 3 años" }
    s.room = { ...s.room, location: "Sótano 1", access: "Llave en caseta", amps: 20, dedicatedBreaker: "si" }
    s.carriers = [
      { id: "k-000001", providerId: "", name: "Totalplay", available: "si", mbps: 1000, leadDays: null, ip: "nat", entry: "", notes: "" },
      { id: "k-000002", providerId: "", name: "Izzi", available: "no", mbps: 500, leadDays: null, ip: "", entry: "", notes: "" },
    ]
    const site = siteFromSurvey(s, { room: "Cuarto de telecom", roles: { administrador: "Administrador", comite: "Comité", mantenimiento: "Mantenimiento", otro: "Otro" }, ip: { publica: "Pública", nat: "Detrás de NAT" } })
    expect(site).toMatchObject({ name: "Residencial Sur", address: "Calle 1", municipality: "Coyoacán", state: "Ciudad de México", accessHours: "9 a 18", accessRules: "Con gafete\nSin ruido", rentMonthly: 2500, powerMonthly: 400, powerPayer: "", agreementNotes: "Exclusividad 3 años" })
    expect(site.towers).toMatchObject([{ name: "Torre B", floors: 3, apartments: 12, roomId: site.rooms[0].id }])
    expect(site.contacts).toMatchObject([{ name: "Rosa", role: "Administrador", phone: "551" }])
    expect(site.rooms[0]).toMatchObject({ name: "Cuarto de telecom", location: "Sótano 1", access: "Llave en caseta", breaker: "20 A (exclusivo)" })
    expect(site.rooms[0].carriers).toMatchObject([{ name: "Totalplay", downMbps: 1000, upMbps: 1000, ip: "Detrás de NAT" }])
    const linked = decodeSurvey(JSON.parse(JSON.stringify({ ...s, siteId: site.id })))!
    expect(linked.siteId).toBe(site.id)
    expect(decodeSurvey(JSON.parse(JSON.stringify(s)))!.siteId).toBe("")
  })
})

describe("deployment sheet fields (owner, 2026-11-28)", () => {
  it("older stored deployments read the new fields as not set", async () => {
    const { decodeSite, newSite, newTower } = await import("./model")
    const old = JSON.parse(JSON.stringify(newSite({ towers: [newTower({ name: "A" })] })))
    delete old.lat
    delete old.lng
    delete old.towers[0].basements
    delete old.towers[0].perFloor
    const s = decodeSite(old)!
    expect([s.lat, s.lng, s.towers[0].basements, s.towers[0].perFloor]).toEqual([null, null, null, []])
    expect(decodeSite({ ...old, lat: 120, lng: -99.1 })!.lat).toBeNull()
    expect(decodeSite({ ...old, lat: 19.4, lng: -99.1 })).toMatchObject({ lat: 19.4, lng: -99.1 })
  })
  it("units per floor follow the floors; the per-floor sum wins over the typed total", async () => {
    const { newTower, syncPerFloor, towerApartments } = await import("./model")
    expect(syncPerFloor(newTower({ floors: 3, perFloor: [4] })).perFloor).toEqual([4, null, null])
    expect(syncPerFloor(newTower({ floors: 2, perFloor: [4, 5, 6] })).perFloor).toEqual([4, 5])
    expect(syncPerFloor(newTower({ floors: null, perFloor: [4] })).perFloor).toEqual([])
    expect(towerApartments(newTower({ apartments: 30, perFloor: [4, null, 6] }))).toBe(10)
    expect(towerApartments(newTower({ apartments: 30, perFloor: [null, null] }))).toBe(30)
    expect(towerApartments(newTower())).toBeNull()
    const { setFloorUnits } = await import("./model")
    const t = setFloorUnits(newTower({ floors: 3, apartments: 30 }), 1, 8)
    expect([t.perFloor, t.apartments]).toEqual([[null, 8, null], 8])
    expect(setFloorUnits(t, 1, null).apartments).toBe(8)
  })
  it("reads a map point as Google Maps copies it", async () => {
    const { parsePoint } = await import("./model")
    expect(parsePoint("19.3612, -99.1641")).toEqual({ lat: 19.3612, lng: -99.1641 })
    expect(parsePoint(" 19.36 -99.16 ")).toEqual({ lat: 19.36, lng: -99.16 })
    expect(parsePoint("19.36;-99.16")).toEqual({ lat: 19.36, lng: -99.16 })
    expect(parsePoint("95, 10")).toBeNull()
    expect(parsePoint("Coyoacán")).toBeNull()
  })
  it("lists what is still missing, by section", async () => {
    const { missingFields, newSite, newTower, newRoomCarrier, newSiteContact } = await import("./model")
    const empty = newSite()
    const keys = missingFields(empty).map((m) => m.key)
    expect(keys).toEqual(expect.arrayContaining(["name", "address", "municipality", "state", "location", "towers", "agreement.start", "agreement.end", "agreement.rent", "agreement.powerPayer", "access.contact", "access.hours", `room.${empty.rooms[0].id}.location`, `room.${empty.rooms[0].id}.breaker`]))
    const t = newTower({ name: "A" })
    const full = newSite({
      name: "X", address: "Calle", municipality: "Coyoacán", state: "Ciudad de México", lat: 19, lng: -99,
      towers: [{ ...t, floors: 5, apartments: 20, roomId: empty.rooms[0].id }],
      rooms: [{ ...empty.rooms[0], location: "Sótano", breaker: "20 A", carriers: [newRoomCarrier({ name: "T", downMbps: 500, monthly: 900 })] }],
      contractStart: "2026-01-01", contractEnd: "2028-01-01", rentMonthly: 0, powerPayer: "edificio",
      contacts: [newSiteContact({ name: "Rosa" })], accessHours: "9 a 18",
    })
    expect(missingFields(full)).toEqual([])
    const noSpeed = { ...full, rooms: [{ ...full.rooms[0], carriers: [newRoomCarrier({ name: "T" })] }] }
    expect(missingFields(noSpeed).map((m) => m.section)).toEqual(["cuartos", "cuartos"])
  })
  it("a survey brings its point, basements and units per floor", async () => {
    const { newSurvey, emptyTower } = await import("../survey/model")
    const { siteFromSurvey } = await import("./from-survey")
    const s = newSurvey("Torre A")
    s.ident = { ...s.ident, lat: 19.36, lng: -99.16 }
    const f = emptyTower("x").floors[0]
    s.towers = [{ ...emptyTower("B"), floorsAbove: 3, floorsBelow: 2, floors: [-2, -1, 0, 1, 2].map((level) => ({ ...f, level, units: level < 0 ? null : level + 2 })) }]
    const site = siteFromSurvey(s, { room: "Cuarto", roles: { administrador: "A", comite: "C", mantenimiento: "M", otro: "O" }, ip: { publica: "P", nat: "N" } })
    expect([site.lat, site.lng]).toEqual([19.36, -99.16])
    expect(site.towers[0]).toMatchObject({ basements: 2, perFloor: [2, 3, 4], apartments: 9 })
  })
})
