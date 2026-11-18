import { describe, expect, it } from "vitest"
import { clientFromLead } from "./from-lead"
import { clientsCsv, guessField, hasHeader, IMPORT_FIELDS, parseTable, pppSecretsToClients, rowsToClients, toDate, toMoney } from "./import"
import { decodeClient, fillEmpty, mergeClients, newClient, sameClient } from "./model"
import { matchInternal } from "../internal-pages"

describe("spreadsheet import", () => {
  it("rows pasted from Excel (tabs) with a header: columns guessed, values converted", () => {
    const text = "Nombre\tTeléfono\tEdificio\tDepto\tPlan\tTV\tFecha de instalación\tMensualidad\tEstado\tUsuario PPPoE\tSerie\n" + "Ana Pérez\t55 1234 5678\tTorre Norte\t301\tplan-500M\tsí\t15/03/2025\t$746.00\tActivo\tana.perez\tHWTC1a2b3c4d\n" + "Luis\t\tTorre Norte\t302\tplan-200M\tno\t2025-04-01\t396\tsuspendido\tluis\t"
    const rows = parseTable(text)
    expect(hasHeader(rows)).toBe(true)
    const map = rows[0].map(guessField)
    expect(map).toEqual(["name", "phone", "building", "apartment", "plan", "tv", "installDate", "monthly", "status", "pppoeUser", "ontSn"])
    const r = rowsToClients(rows, map, true)
    expect(r.errors).toEqual([])
    expect(r.clients[0]).toMatchObject({ name: "Ana Pérez", apartment: "301", tv: true, installDate: "2025-03-15", monthly: 746, status: "activo", pppoeUser: "ana.perez", ontSn: "HWTC1A2B3C4D" })
    expect(r.clients[1]).toMatchObject({ tv: false, installDate: "2025-04-01", monthly: 396, status: "suspendido" })
  })
  it("CSV with quotes, commas inside and semicolons; bad values listed, lines without name or user skipped", () => {
    const rows = parseTable('nombre;mensualidad;fecha alta;usuario\n"Pérez, Ana";1.234,50;31/02/2025;ana\n;;;\n;100;;')
    expect(rows).toHaveLength(3)
    const r = rowsToClients(rows, ["name", "monthly", "installDate", "pppoeUser"], true)
    expect(r.clients).toHaveLength(1)
    expect(r.clients[0]).toMatchObject({ name: "Pérez, Ana", monthly: 1234.5, installDate: "" })
    expect(r.errors.map((e) => e.field)).toEqual(["installDate", "row"])
  })
  it("dates and money", () => {
    expect(["15/03/2025", "1-4-25", "2025-03-15", "31/02/2025", "hoy"].map(toDate)).toEqual(["2025-03-15", "2025-04-01", "2025-03-15", "", ""])
    expect(["$1,234.50", "1234,50", "596", "MXN 400", "", "abc"].map(toMoney)).toEqual([1234.5, 1234.5, 596, 400, null, null])
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
    expect(r.clients.map((c) => [c.pppoeUser, c.plan, c.status])).toEqual([
      ["ana.perez", "plan-500M", "activo"],
      ["luis", "plan-200M", "suspendido"],
      ["moroso", "DSX-suspendido", "suspendido"],
    ])
    expect(r.skipped).toBe(1)
    expect(JSON.stringify(r.clients)).not.toContain("secreto1")
  })
  it("export terse (one /ppp secret add per line)", () => {
    const r = pppSecretsToClients('/ppp secret add comment=Rosa name=rosa password=x profile=plan-1G service=pppoe\n/ip pool add name=p ranges=1.1.1.1')
    expect(r.clients.map((c) => [c.pppoeUser, c.name])).toEqual([["rosa", "Rosa"]])
  })
})

describe("matching and merging", () => {
  it("same client by PPPoE user, or by name + building + apartment", () => {
    expect(sameClient(newClient({ pppoeUser: "Ana" }), newClient({ pppoeUser: "ana", name: "otra" }))).toBe(true)
    expect(sameClient(newClient({ name: "José Pérez", building: "Torre A", apartment: "301" }), newClient({ name: "jose perez", building: "torre a", apartment: "301" }))).toBe(true)
    expect(sameClient(newClient({ name: "José", apartment: "301" }), newClient({ name: "José", apartment: "302" }))).toBe(false)
  })
  it("an import only fills empty fields; nothing typed is overwritten", () => {
    const base = newClient({ name: "Ana", pppoeUser: "ana", phone: "5511111111", plan: "" })
    const inc = newClient({ name: "Ana del Excel", pppoeUser: "ana", phone: "5599999999", plan: "plan-500M", ontSn: "SN1" })
    expect(fillEmpty(base, inc).client).toMatchObject({ name: "Ana", phone: "5511111111", plan: "plan-500M", ontSn: "SN1" })
    const r = mergeClients([base], [inc, newClient({ pppoeUser: "luis" }), newClient({ pppoeUser: "ana" })])
    expect([r.added.length, r.filled.length, r.same]).toEqual([1, 1, 1])
  })
  it("reads stored values leniently", () => {
    expect(decodeClient({ status: "hack", payDay: 40, payMethod: "bitcoin", ontSn: "abc", installDate: "15/03/2025" })).toMatchObject({ status: "activo", payDay: null, payMethod: "", ontSn: "ABC", installDate: "" })
    expect(decodeClient(null)).toBeNull()
  })
})

describe("from the website", () => {
  it("a request becomes a client with plan, TV and the monthly total from the site's prices", () => {
    const c = clientFromLead({ id: "lead-1234567", name: "Rosa", phone: "5512345678", email: "r@example.com", address: "Av. Ejemplo 1, depto 4", planId: "fibra-500", addOnIds: ["tv"] }, "2026-11-17")
    expect(c).toMatchObject({ name: "Rosa", whatsapp: "5512345678", building: "Av. Ejemplo 1, depto 4", plan: "500 Mbps", tv: true, monthly: 746, installDate: "2026-11-17", leadId: "lead-1234567" })
  })
  it("CSV export has every field with Spanish headers and a BOM for Excel", () => {
    const csv = clientsCsv([newClient({ name: 'Pérez, "Ana"', tv: true })], Object.fromEntries(IMPORT_FIELDS.map((f) => [f, f.toUpperCase()])) as Record<(typeof IMPORT_FIELDS)[number], string>)
    expect(csv.startsWith("﻿NAME,")).toBe(true)
    expect(csv).toContain('"Pérez, ""Ana"""')
    expect(csv).toContain(",sí,")
  })
  it("/interno/admin/clientes is an internal page", () => {
    expect(matchInternal("/INTERNO/Admin/Clientes")?.rewriteTo).toBe("/es/interno/admin/clientes")
  })
})
