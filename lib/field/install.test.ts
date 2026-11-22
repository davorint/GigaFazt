import { describe, expect, it } from "vitest"
import { newClient, newService } from "../clients/model"
import { installedOn } from "./install"

describe("Installation done on another day", () => {
  const c = {
    ...newClient(),
    services: [
      { ...newService("internet"), id: "i", start: "2026-12-04", status: "activo" as const },
      { ...newService("iptv"), id: "t", start: "2026-12-04", status: "activo" as const },
      { ...newService("otro"), id: "o", start: "2026-10-01", status: "activo" as const },
    ],
  }
  it("services that started on the planned day move to the real day; others stay", () => {
    expect(installedOn(c, "2026-12-04", "2026-12-17")?.services.map((s) => s.start)).toEqual(["2026-12-17", "2026-12-17", "2026-10-01"])
  })
  it("same day or nothing on that day: no change", () => {
    expect(installedOn(c, "2026-12-04", "2026-12-04")).toBeNull()
    expect(installedOn(c, "2026-11-30", "2026-12-04")).toBeNull()
  })
})
