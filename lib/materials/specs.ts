/**
 * Material product types and their characteristics, per category (owner, 2026-11-19). Fiber cable has its own menus
 * (fiber.ts); everything else is here. Labels: messages/internal/materiales.es.json → materiales.specs.
 */
import type { SpecCatalog } from "../specs/engine"
import type { Category } from "./catalog"

const yesNo = ["si", "no"] as const
const n = (unit: string, min: number, max: number, integer = true) => ({ kind: "number" as const, unit, min, max, integer })
const p = (options: readonly string[]) => ({ kind: "pick" as const, options })

export const MATERIAL_SPECS: SpecCatalog<Category> = {
  fields: {
    connector: p(["sc-apc", "sc-upc", "lc-apc", "lc-upc", "fc-upc", "sin"]),
    fiberMode: p(["sm", "mm"]),
    ratio: p(["1x2", "1x4", "1x8", "1x16", "1x32", "1x64", "2x8", "2x16", "2x32"]),
    tap: p(["1-99", "2-98", "5-95", "10-90", "15-85", "20-80", "30-70", "40-60", "50-50"]),
    splitterFormat: p(["tubo", "abs", "rack", "lgx", "charola"]),
    ports: n("", 1, 288),
    splices: n("", 1, 576),
    splitterIncluded: p(yesNo),
    closureShape: p(["domo", "horizontal"]),
    ip: p(["ip54", "ip55", "ip65", "ip66", "ip67", "ip68"]),
    mount: p(["poste", "pared", "fachada", "rack", "registro", "cable", "escritorio"]),
    lengthM: n("m", 0.1, 5000, false),
    sleeveMm: n("mm", 20, 80),
    attenuationDb: n("dB", 1, 30),
    pon: p(["gpon", "xgs-pon", "xg-pon", "epon", "10g-epon"]),
    opticClass: p(["b-plus", "c-plus", "c-plus-plus", "c-plus-plus-plus"]),
    reachKm: n("km", 1, 120),
    lanPorts: n("", 0, 52),
    ponPorts: n("", 1, 64),
    uplink: p(["1g", "2-5g", "10g", "25g", "100g"]),
    wifi: p(["no", "wifi4", "wifi5", "wifi6", "wifi6e", "wifi7"]),
    potsPort: p(yesNo),
    catv: p(yesNo),
    poe: p(["no", "poe", "poe-plus", "poe-plus-plus", "pasivo"]),
    va: n("VA", 300, 20000),
    material: p(["acero-galvanizado", "acero-inox", "aluminio", "plastico-uv", "abs", "nylon"]),
    cableShape: p(["plano", "redondo", "figura-8"]),
    maxLoadN: n("N", 50, 50000),
    minDiameter: n("mm", 1, 40, false),
    maxDiameter: n("mm", 1, 40, false),
    widthMm: n("mm", 5, 50, false),
    ductDiameter: p(["1-2", "3-4", "1", "1-1-4", "1-1-2", "2", "3", "4"]),
    wall: p(["lisa", "corrugada"]),
    ductMaterial: p(["pead", "pvc", "pad", "galvanizado"]),
    packQty: n("pzas", 1, 10000),
  },
  types: {
    fibra: {},
    splitters: {
      plc: ["ratio", "connector", "splitterFormat"],
      fbt: ["tap", "connector", "splitterFormat"],
    },
    cajas: {
      nap: ["ports", "splices", "splitterIncluded", "ip", "mount"],
      "cierre-empalme": ["closureShape", "splices", "ports", "ip", "mount"],
      "charola-empalme": ["splices"],
      odf: ["ports", "connector", "mount"],
      roseta: ["ports", "connector"],
      gabinete: ["ip", "mount"],
    },
    conectores: {
      pigtail: ["connector", "fiberMode", "lengthM"],
      "patch-cord": ["connector", "fiberMode", "lengthM"],
      acoplador: ["connector"],
      "conector-rapido": ["connector"],
      "manguito-empalme": ["sleeveMm"],
      atenuador: ["connector", "attenuationDb"],
    },
    ont: {
      ont: ["pon", "lanPorts", "wifi", "potsPort", "catv"],
      "onu-bridge": ["pon", "lanPorts"],
    },
    equipo: {
      olt: ["pon", "ponPorts", "uplink"],
      "sfp-pon": ["pon", "opticClass", "reachKm", "connector"],
      "sfp-uplink": ["uplink", "fiberMode", "reachKm", "connector"],
      switch: ["lanPorts", "uplink", "poe"],
      router: ["lanPorts", "uplink"],
      ups: ["va"],
    },
    wifi: {
      "access-point": ["wifi", "poe"],
      mesh: ["wifi"],
      "router-wifi": ["wifi", "lanPorts"],
    },
    obra: {
      "mano-de-obra": [],
      ducto: ["ductDiameter", "wall", "ductMaterial", "lengthM"],
      canaleta: ["lengthM"],
      registro: [],
    },
    herrajes: {
      "remate-drop": ["cableShape", "maxLoadN", "material"],
      "tensor-drop": ["cableShape", "maxLoadN", "material"],
      "tensor-adss": ["minDiameter", "maxDiameter", "maxLoadN"],
      "suspension-adss": ["minDiameter", "maxDiameter"],
      fleje: ["material", "widthMm", "lengthM"],
      hebilla: ["material", "widthMm"],
      "raqueta-reserva": ["minDiameter", "maxDiameter", "material"],
      "gancho-fachada": ["material"],
      "abrazadera-poste": ["material"],
    },
    consumibles: {
      "limpiador-pluma": ["connector"],
      "limpiador-casete": [],
      toallitas: ["packQty"],
      alcohol: [],
      etiqueta: ["packQty"],
      cincho: ["packQty"],
      cinta: [],
    },
    otros: {},
  },
}
