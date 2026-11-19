import { describe, expect, it } from "vitest"
import { csvCell, toCsv, unguard } from "./csv"

describe("toCsv", () => {
  it("BOM, header, quoted cells only when needed, sí/no, empty for null", () => {
    const out = toCsv(["Nombre", "Notas", "Activo", "Precio"], [["Fusionadora", 'dice "ok", luego', true, null], ["Cortadora", "línea 1\nlínea 2", false, 1500.5]])
    expect(out.startsWith("﻿")).toBe(true)
    expect(out.slice(1).split("\r\n")).toEqual(["Nombre,Notas,Activo,Precio", 'Fusionadora,"dice ""ok"", luego",sí,', 'Cortadora,"línea 1\nlínea 2",no,1500.5', ""])
  })
  it("text that starts like a formula opens as text in Excel; numbers stay numbers; the import takes the mark off", () => {
    expect(["=1+1", "+52 55", "-x", "@SUM(A1)", "ok"].map(csvCell)).toEqual(["'=1+1", "'+52 55", "'-x", "'@SUM(A1)", "ok"])
    expect(csvCell(-5)).toBe("-5")
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`)
    expect(["'=1+1", "'+52 55", "'hola"].map(unguard)).toEqual(["=1+1", "+52 55", "'hola"])
  })
})
