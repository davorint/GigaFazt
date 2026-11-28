/**
 * A survey becomes a deployment (owner, 2026-11-20: "a levantamiento is a new survey, once the info is captured, it
 * becomes a Despliegue"). What both describe is carried over once, so nothing is typed twice:
 * - name, address, municipality, state and the map point;
 * - each tower: its name, floors above the street, basements, units per floor and their total, served by the room;
 * - the contacts (role written out) and the access: work hours and rules from the permits;
 * - the agreement: rent, electricity and who pays it, the commercial notes;
 * - one telecom room from the survey's room (location, access, breaker, power notes) with the carriers marked as
 *   available, their speed as both directions (the survey has one figure) and how the IP arrives.
 * The rest (design, routes, common areas, pending items, materials, the proposal) stays in the survey, which keeps a
 * link to the deployment (Survey.siteId) and shows as its "Levantamiento" tab.
 */
import { towerUnits, type ContactRole, type Survey } from "../survey/model"
import { newRoom, newRoomCarrier, newSite, newSiteContact, newTower, syncPerFloor, type PowerPayer, type Site } from "./model"

export type FromSurveyLabels = {
  /** The room's name, e.g. "Cuarto de telecom". */
  room: string
  roles: Record<ContactRole, string>
  /** How the IP arrives, written out. */
  ip: { publica: string; nat: string }
}

const POWER: Record<Survey["commercial"]["powerPaidBy"], PowerPayer> = { nosotros: "nosotros", edificio: "edificio", pendiente: "", "": "" }

export function siteFromSurvey(s: Survey, labels: FromSurveyLabels): Site {
  const room = newRoom({
    name: labels.room,
    location: s.room.location,
    access: s.room.access,
    breaker: s.room.amps !== null ? `${s.room.amps} A${s.room.dedicatedBreaker === "si" ? " (exclusivo)" : ""}` : "",
    powerNotes: s.room.notes,
    carriers: s.carriers
      .filter((c) => c.available === "si")
      .map((c) => newRoomCarrier({ providerId: c.providerId, name: c.name, downMbps: c.mbps, upMbps: c.mbps, ip: c.ip ? labels.ip[c.ip] : "", notes: c.notes })),
  })
  return newSite({
    name: s.ident.name,
    address: s.ident.address,
    municipality: s.ident.municipality,
    state: s.ident.state,
    lat: s.ident.lat !== null && s.ident.lng !== null ? s.ident.lat : null,
    lng: s.ident.lat !== null && s.ident.lng !== null ? s.ident.lng : null,
    towers: s.towers.map((t) => {
      const by = new Map(t.floors.filter((f) => f.level >= 0).map((f) => [f.level, f.units]))
      return syncPerFloor(
        newTower({ name: t.name, floors: t.floorsAbove, apartments: towerUnits(t) || null, basements: t.floorsBelow, perFloor: Array.from({ length: t.floorsAbove ?? 0 }, (_, i) => by.get(i) ?? null), roomId: room.id, notes: t.notes })
      )
    }),
    contacts: s.contacts.filter((c) => c.name || c.phone || c.email).map((c) => newSiteContact({ name: c.name, role: labels.roles[c.role], phone: c.phone, email: c.email })),
    accessHours: s.permits.workHours,
    accessRules: [s.permits.accessRules, s.permits.rules].filter(Boolean).join("\n"),
    rentMonthly: s.commercial.rentMonthly,
    powerMonthly: s.commercial.powerMonthly,
    powerPayer: POWER[s.commercial.powerPaidBy],
    agreementNotes: s.commercial.notes,
    rooms: [room],
  })
}
