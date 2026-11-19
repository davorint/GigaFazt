/**
 * Tool types and their characteristics, per category (owner, 2026-11-19). Labels: messages/internal/herramientas.es.json
 * → herramientas.specs.
 */
import type { SpecCatalog } from "../specs/engine"
import type { ToolCategory } from "./model"

const yesNo = ["si", "no"] as const
const n = (unit: string, min: number, max: number, integer = true) => ({ kind: "number" as const, unit, min, max, integer })
const p = (options: readonly string[]) => ({ kind: "pick" as const, options })
const ladder = ["ladderMaterial", "heightM", "steps", "loadKg", "dielectric"] as const
const powered = ["power", "voltage", "batteryAh"] as const

export const TOOL_SPECS: SpecCatalog<ToolCategory> = {
  fields: {
    alignment: p(["nucleo", "revestimiento", "v-groove"]),
    motors: n("", 2, 8),
    heaters: n("", 1, 2),
    spliceSec: n("s", 1, 60),
    batterySplices: n("empalmes", 10, 2000),
    cleaveType: p(["manual", "automatico"]),
    bladeLife: n("cortes", 1000, 200000),
    wavelengths: p(["1310-1550", "1310-1550-1625", "1310-1490-1550", "1310-1550-1650", "850-1300", "650"]),
    dynamicRangeDb: n("dB", 10, 50, false),
    deadZoneM: n("m", 0.1, 50, false),
    minDbm: n("dBm", -80, 0, false),
    maxDbm: n("dBm", -50, 30, false),
    ponPassThrough: p(yesNo),
    vflPowerMw: n("mW", 1, 50, false),
    vflRangeKm: n("km", 1, 50),
    magnification: n("×", 50, 800),
    connectorIface: p(["sc", "fc", "lc", "universal-2-5", "universal-1-25"]),
    stripperHoles: n("", 1, 4),
    lengthM: n("m", 1, 200, false),
    power: p(["bateria", "electrica", "manual"]),
    voltage: p(["12v", "18v", "20v", "24v", "36v", "127v"]),
    batteryAh: n("Ah", 1, 12, false),
    ladderMaterial: p(["fibra-de-vidrio", "aluminio"]),
    heightM: n("m", 1, 20, false),
    steps: n("", 2, 40),
    loadKg: n("kg", 50, 250),
    dielectric: p(yesNo),
    harnessClass: p(["cuerpo-completo", "posicionamiento", "linea-de-vida"]),
    size: p(["ch", "m", "g", "eg", "unitalla"]),
  },
  types: {
    empalme: {
      fusionadora: ["alignment", "motors", "heaters", "spliceSec", "batterySplices"],
      cortadora: ["cleaveType", "bladeLife"],
      "pistola-calor": ["power"],
      "herramienta-conectores": ["connectorIface"],
    },
    medicion: {
      otdr: ["wavelengths", "dynamicRangeDb", "deadZoneM", "connectorIface"],
      "medidor-potencia": ["wavelengths", "minDbm", "maxDbm", "connectorIface"],
      "medidor-pon": ["wavelengths", "ponPassThrough", "connectorIface"],
      "fuente-luz": ["wavelengths", "connectorIface"],
      vfl: ["vflPowerMw", "vflRangeKm", "connectorIface"],
      microscopio: ["magnification", "connectorIface"],
      multimetro: [],
      "probador-red": [],
    },
    corte: {
      "peladora-fibra": ["stripperHoles"],
      "peladora-drop": [],
      "tijeras-kevlar": [],
      "cortador-buffer": [],
      "pinzas-corte": [],
    },
    limpieza: {
      "limpiador-one-click": ["connectorIface"],
      "dispensador-alcohol": [],
    },
    mano: {
      pinzas: [],
      ponchadora: [],
      "guia-pasacables": ["lengthM"],
      desarmadores: [],
      etiquetadora: [],
      lampara: [],
      "caja-herramientas": [],
    },
    electrica: {
      taladro: [...powered],
      rotomartillo: [...powered],
    },
    altura: {
      "escalera-tijera": [...ladder],
      "escalera-extensible": [...ladder],
    },
    seguridad: {
      arnes: ["harnessClass", "size", "loadKg"],
      casco: ["dielectric"],
      lentes: [],
      guantes: ["size"],
    },
    otros: {},
  },
}
