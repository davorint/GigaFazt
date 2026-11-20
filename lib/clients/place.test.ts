import { describe, expect, it } from "vitest"
import { newClient } from "./model"
import { newSite, newTower } from "../sites/model"
import { clientPlace } from "./place"

describe("where a client lives (owner review 2026-11-20)", () => {
  it("a client in a deployment: deployment · tower · apartment; otherwise what was typed", () => {
    const site = newSite({ name: "Residencial Los Pinos", towers: [newTower({ name: "Torre A" }), newTower({ name: "" })] })
    expect(clientPlace(newClient({ siteId: site.id, towerId: site.towers[0].id, apartment: "304" }), [site])).toBe("Residencial Los Pinos · Torre A · 304")
    expect(clientPlace(newClient({ siteId: site.id, towerId: site.towers[1].id, apartment: "12" }), [site])).toBe("Residencial Los Pinos · Torre 2 · 12")
    expect(clientPlace(newClient({ building: "Edificio Sol", tower: "B", apartment: "5" }), [site])).toBe("Edificio Sol · B · 5")
    expect(clientPlace(newClient({ siteId: "borrado-0001", building: "Viejo", apartment: "1" }), [site])).toBe("Viejo · 1")
  })
})
