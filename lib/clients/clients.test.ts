import { describe, expect, it } from "vitest"
import { clientFromLead } from "./from-lead"
import { clientsCsv, guessField, hasHeader, IMPORT_FIELDS, parseTable, pppSecretsToClients, rowsToClients, toDate, toMoney, type ImportField } from "./import"
import { clientStatus, decodeClient, fillEmpty, mergeClients, monthlyTotal, newClient, newService, onOurFiber, sameClient, type Client } from "./model"
import { matchInternal } from "../internal-pages"

const net = (c: Client) => c.services.find((s) => s.type === "internet")
const tv = (c: Client) => c.services.find((s) => s.type === "iptv")
const withUser = (u: string, p: Partial<Client> = {}) => newClient({ ...p, services: [newService("internet", { pppoeUser: u })] })

describe("spreadsheet import", () => {
  it("rows pasted from Excel (tabs) with a header: columns guessed, internet and TV services built", () => {
    const text =
      "Tipo\tNombre\tTeléfono\tEdificio\tDepto\tPlan\tTV\tPaquete TV\tMensualidad TV\tFecha de instalación\tMensualidad\tEstado\tUsuario PPPoE\tSerie\n" +
      "Residencial\tAna Pérez\t55 1234 5678\tTorre Norte\t301\tplan-500M\tsí\tBásico\t250\t15/03/2025\t$496.00\tActivo\tana.perez\tHWTC1a2b3c4d\n" +
      "\tLuis\t\tTorre Norte\t302\tplan-200M\tno\t\t\t2025-04-01\t396\tsuspendido\tluis\t\n" +
      "TV\tRosa\t5599990000\tFuera de red\t\tPremium\t\t\t\t2025-05-01\t300\tactivo\t\t"
    const rows = parseTable(text)
    expect(hasHeader(rows)).toBe(true)
    const map = rows[0].map(guessField)
    expect(map).toEqual(["kind", "name", "phone", "building", "apartment", "plan", "tv", "tvPackage", "tvMonthly", "installDate", "monthly", "status", "pppoeUser", "ontSn"])
    const r = rowsToClients(rows, map, true)
    expect(r.errors).toEqual([])
    const [ana, luis, rosa] = r.clients
    expect(ana).toMatchObject({ kind: "residencial", name: "Ana Pérez", apartment: "301" })
    expect(net(ana)).toMatchObject({ plan: "plan-500M", start: "2025-03-15", monthly: 496, status: "activo", pppoeUser: "ana.perez", ontSn: "HWTC1A2B3C4D" })
    expect(tv(ana)).toMatchObject({ plan: "Básico", monthly: 250, start: "2025-03-15" })
    expect(monthlyTotal(ana)).toBe(746)
    expect(luis.services.map((s) => [s.type, s.status])).toEqual([["internet", "suspendido"]])
    expect(clientStatus(luis)).toBe("suspendido")
    // A TV client without internet: plan, price and status are its TV's; watched over another provider's internet.
    expect(rosa.kind).toBe("tv")
    expect(rosa.services.map((s) => [s.type, s.plan, s.monthly])).toEqual([["iptv", "Premium", 300]])
    expect(onOurFiber(rosa)).toBe(false)
    expect(onOurFiber(ana)).toBe(true)
  })
  it("CSV with quotes, commas inside and semicolons; bad values listed, lines without name or user skipped", () => {
    const rows = parseTable('nombre;mensualidad;fecha alta;usuario;tipo\n"Pérez, Ana";1.234,50;31/02/2025;ana;planeta\n;;;;\n;100;;;')
    expect(rows).toHaveLength(3)
    const r = rowsToClients(rows, ["name", "monthly", "installDate", "pppoeUser", "kind"], true)
    expect(r.clients).toHaveLength(1)
    expect(r.clients[0]).toMatchObject({ name: "Pérez, Ana", kind: "residencial" })
    expect(net(r.clients[0])).toMatchObject({ monthly: 1234.5, start: "" })
    expect(r.errors.map((e) => e.field)).toEqual(["kind", "installDate", "row"])
  })
  it("client types from the words people use", () => {
    const rows = [["Administración del condominio", "Adm"], ["empresa", "Acme"], ["IPTV", "Rosa"], ["residente", "Ana"]]
    expect(rowsToClients(rows, ["kind", "name"], false).clients.map((c) => c.kind)).toEqual(["administracion", "empresa", "tv", "residencial"])
  })
  it("dates and money", () => {
    expect(["15/03/2025", "1-4-25", "2025-03-15", "31/02/2025", "hoy"].map(toDate)).toEqual(["2025-03-15", "2025-04-01", "2025-03-15", "", ""])
    expect(["$1,234.50", "1234,50", "1.234,50", "596", "MXN 400", "", "abc"].map(toMoney)).toEqual([1234.5, 1234.5, 1234.5, 596, 400, null, null])
  })
})

describe("MikroTik import", () => {
  it("reads /ppp secret export (wrapped lines, quoted comments), skips non-PPPoE and keeps no password", () => {
    const text = [
      "# nov/17/2026 by RouterOS 7.25.1",
      "/ppp profile",
      'add name=plan-500M rate-limit="100M/100M 500M/500M"',
      "/ppp secret",
      'add comment="Ana P\\u00e9rez 301" name=ana.perez password=secreto1 profile=plan-500M \\',
      "    service=pppoe",
      "add disabled=yes name=luis password=x profile=plan-200M service=pppoe",
      "add name=moroso password=x profile=DSX-suspendido service=pppoe",
      "add name=vpn1 password=x service=l2tp",
      "/ip pool",
      "add name=DS-clientes ranges=100.64.0.2-100.64.3.254",
    ].join("\n")
    const r = pppSecretsToClients(text)
    expect(r.clients.map((c) => [net(c)?.pppoeUser, net(c)?.plan, net(c)?.status])).toEqual([
      ["ana.perez", "plan-500M", "activo"],
      ["luis", "plan-200M", "suspendido"],
      ["moroso", "DSX-suspendido", "suspendido"],
    ])
    expect(r.skipped).toBe(1)
    expect(JSON.stringify(r.clients)).not.toContain("secreto1")
  })
  it("export terse (one /ppp secret add per line)", () => {
    const r = pppSecretsToClients("/ppp secret add comment=Rosa name=rosa password=x profile=plan-1G service=pppoe\n/ip pool add name=p ranges=1.1.1.1")
    expect(r.clients.map((c) => [net(c)?.pppoeUser, c.name])).toEqual([["rosa", "Rosa"]])
  })
})

describe("matching and merging", () => {
  it("same client by a PPPoE user in common, or by name + building + apartment", () => {
    expect(sameClient(withUser("Ana"), withUser("ana", { name: "otra" }))).toBe(true)
    expect(sameClient(newClient({ name: "José Pérez", building: "Torre A", apartment: "301" }), newClient({ name: "jose perez", building: "torre a", apartment: "301" }))).toBe(true)
    expect(sameClient(newClient({ name: "José", apartment: "301" }), newClient({ name: "José", apartment: "302" }))).toBe(false)
    // A company with two internet links matches either of its users.
    const company = newClient({ kind: "empresa", services: [newService("internet", { pppoeUser: "acme-1" }), newService("internet", { pppoeUser: "acme-2" })] })
    expect(sameClient(company, withUser("ACME-2"))).toBe(true)
  })
  it("an import only fills empty fields and adds the services the client lacks; nothing typed is overwritten", () => {
    const base = newClient({ name: "Ana", phone: "5511111111", services: [newService("internet", { pppoeUser: "ana", plan: "", monthly: 400 })] })
    const inc = newClient({ name: "Ana del Excel", phone: "5599999999", email: "a@x.mx", services: [newService("internet", { pppoeUser: "ana", plan: "plan-500M", monthly: 999, ontSn: "SN1", status: "suspendido" }), newService("iptv", { plan: "Básico" })] })
    const r = fillEmpty(base, inc)
    expect(r.client).toMatchObject({ name: "Ana", phone: "5511111111", email: "a@x.mx" })
    expect(r.client.services.map((s) => [s.type, s.plan, s.monthly, s.ontSn, s.status])).toEqual([
      ["internet", "plan-500M", 400, "SN1", "activo"],
      ["iptv", "Básico", null, "", "activo"],
    ])
    const m = mergeClients([base], [inc, withUser("luis"), withUser("ana")])
    expect([m.added.length, m.filled.length, m.same]).toEqual([1, 1, 1])
  })
  it("a second internet link of a company is added, not merged into the first", () => {
    const base = newClient({ kind: "empresa", name: "Acme", services: [newService("internet", { pppoeUser: "acme-1" })] })
    const r = fillEmpty(base, newClient({ name: "Acme", services: [newService("internet", { pppoeUser: "acme-1" }), newService("internet", { pppoeUser: "acme-2" })] }))
    expect(r.client.services.map((s) => s.pppoeUser)).toEqual(["acme-1", "acme-2"])
  })
  it("status from the services", () => {
    const st = (...x: ("activo" | "suspendido" | "cancelado")[]) => clientStatus(newClient({ services: x.map((status) => newService("otro", { status })) }))
    expect([st(), st("cancelado", "activo"), st("cancelado", "suspendido"), st("cancelado")]).toEqual(["sin-servicio", "activo", "suspendido", "cancelado"])
    const c = newClient({ services: [newService("internet", { monthly: 496 }), newService("iptv", { monthly: 250 }), newService("otro", { monthly: 1000, status: "cancelado" }), newService("otro")] })
    expect(monthlyTotal(c)).toBe(746)
  })
  it("reads stored values leniently", () => {
    const c = decodeClient({ kind: "vip", payDay: 40, payMethod: "bitcoin", contacts: [{ name: "Luis", role: "Sistemas" }, 3], services: [{ type: "iptv", status: "hack", ontSn: "abc", pppoeUser: "x", start: "15/03/2025" }, { type: "internet", ontSn: "abc" }, "x"] })
    expect(c).toMatchObject({ kind: "residencial", payDay: null, payMethod: "" })
    expect(c?.contacts.map((k) => k.name)).toEqual(["Luis"])
    expect(c?.services.map((s) => [s.type, s.status, s.ontSn, s.pppoeUser, s.start])).toEqual([
      ["iptv", "activo", "", "", ""],
      ["internet", "activo", "ABC", "", ""],
    ])
    expect(decodeClient(null)).toBeNull()
  })
})

describe("from the website", () => {
  it("a request becomes a residential client with internet and, when asked, TV at the site's prices", () => {
    const c = clientFromLead({ id: "lead-1234567", name: "Rosa", phone: "5512345678", email: "r@example.com", address: "Av. Ejemplo 1, depto 4", planId: "fibra-500", addOnIds: ["tv"] }, "2026-11-17")
    expect(c).toMatchObject({ kind: "residencial", name: "Rosa", whatsapp: "5512345678", building: "Av. Ejemplo 1, depto 4", leadId: "lead-1234567" })
    expect(c.services.map((s) => [s.type, s.plan, s.monthly, s.start])).toEqual([
      ["internet", "500 Mbps", 496, "2026-11-17"],
      ["iptv", "TV", 250, "2026-11-17"],
    ])
  })
  it("CSV export round-trips through the import (headers guessed back)", () => {
    const headers = { kind: "Tipo", name: "Nombre", phone: "Teléfono", whatsapp: "WhatsApp", email: "Correo", building: "Edificio", tower: "Torre", apartment: "Departamento", plan: "Plan de internet", installDate: "Fecha de instalación", monthly: "Mensualidad", status: "Estado", ontModel: "Modelo de ONT", ontSn: "Serie del ONT (SN)", pppoeUser: "Usuario PPPoE", deployment: "Despliegue", oltPort: "Puerto de la OLT", ontId: "ID del ONT", tv: "TV (IPTV)", tvPackage: "Paquete de TV", tvMonthly: "Mensualidad de TV", payDay: "Día de pago", payMethod: "Forma de pago", notes: "Notas" } satisfies Record<ImportField, string>
    const labels = { kind: { residencial: "Residencial", administracion: "Administración", empresa: "Empresa", tv: "TV" }, status: { activo: "Activo", suspendido: "Suspendido", cancelado: "Cancelado", "sin-servicio": "Sin servicio" } }
    const ana = newClient({ name: 'Pérez, "Ana"', services: [newService("internet", { pppoeUser: "ana", plan: "plan-500M", monthly: 496, start: "2025-03-15" }), newService("iptv", { plan: "Básico", monthly: 250 })] })
    const rosa = newClient({ kind: "tv", name: "Rosa", services: [newService("iptv", { plan: "Premium", monthly: 300, status: "suspendido" })] })
    // A resident with only IPTV, and a name typed like a formula on the public form.
    const luis = newClient({ name: "=HYPERLINK(1)", phone: "+52 55 1234 5678", services: [newService("iptv", { plan: "Básico", monthly: 250, start: "2026-01-10" })] })
    const csv = clientsCsv([ana, rosa, luis], headers, labels)
    expect(csv).toContain("'=HYPERLINK(1),'+52 55 1234 5678")
    expect(csv.startsWith("﻿Tipo,Nombre,")).toBe(true)
    expect(csv).toContain('"Pérez, ""Ana"""')
    const rows = parseTable(csv)
    expect(rows[0].map(guessField)).toEqual([...IMPORT_FIELDS])
    const back = rowsToClients(rows, rows[0].map(guessField), true).clients
    expect(back.map((c) => [c.kind, c.name, c.services.map((s) => [s.type, s.plan, s.monthly, s.status])])).toEqual([
      ["residencial", 'Pérez, "Ana"', [["internet", "plan-500M", 496, "activo"], ["iptv", "Básico", 250, "activo"]]],
      ["tv", "Rosa", [["iptv", "Premium", 300, "suspendido"]]],
      ["residencial", "=HYPERLINK(1)", [["iptv", "Básico", 250, "activo"]]],
    ])
    expect(back[2]).toMatchObject({ phone: "+52 55 1234 5678", services: [{ start: "2026-01-10" }] })
  })
  it("/interno/admin/clientes is an internal page", () => {
    expect(matchInternal("/INTERNO/Admin/Clientes")?.rewriteTo).toBe("/es/interno/admin/clientes")
  })
})
