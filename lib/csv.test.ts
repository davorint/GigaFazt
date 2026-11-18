import { describe, expect, it } from "vitest"
import { toCsv } from "./csv"

describe("toCsv", () => {
  it("BOM, header, quoted cells only when needed, sí/no, empty for null", () => {
    const out = toCsv(["Nombre", "Notas", "Activo", "Precio"], [["Fusionadora", 'dice "ok", luego', true, null], ["Cortadora", "línea 1\nlínea 2", false, 1500.5]])
    expect(out.startsWith("﻿")).toBe(true)
    expect(out.slice(1).split("\r\n")).toEqual(["Nombre,Notas,Activo,Precio", 'Fusionadora,"dice ""ok"", luego",sí,', 'Cortadora,"línea 1\nlínea 2",no,1500.5', ""])
  })
})
