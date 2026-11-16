/**
 * Knowledge base for Huawei SmartAX OLTs (MA5600T family and MA5800), for buying and replacing equipment
 * (owner, 2026-11-16). Internal page /olt.
 *
 * Every figure names its source. "huawei" = a Huawei document (hardware description, datasheet) read through a
 * public mirror; "reseller" = a seller's page (useful, not authoritative). Nothing here is invented: a value nobody
 * published is left out (undefined) and the page says so.
 */

export type SourceKind = "huawei" | "reseller"
export type Source = { id: string; kind: SourceKind; title: string; url: string; date?: string }

export const SOURCES: Source[] = [
  {
    id: "hd5600",
    kind: "huawei",
    title: "SmartAX MA5600T/MA5603T/MA5608T Multi-service Access Module Hardware Description, Issue 08",
    url: "https://pdfcoffee.com/ma5600tampma5603tampma5608t-hardware-description-08-5-pdf-free.html",
    date: "2013-12-18",
  },
  {
    id: "ds5600",
    kind: "huawei",
    title: "Huawei SmartAX MA5600T OLT Datasheet (copia publicada por Router-Switch)",
    url: "https://www.router-switch.com/media/upload/product-pdf/huawei-smartax-ma5600t-datasheet.pdf",
  },
  {
    id: "ds5800",
    kind: "huawei",
    title: "MA5800-X17&X15&X7&X2 Product Datasheet, Issue 08",
    url: "https://www.ycict.net/wp-content/uploads/2023/09/MA5800-X17X15X7X2-Product-Description-08.pdf",
    date: "2023-06-29",
  },
  { id: "brochure5600", kind: "huawei", title: "Huawei SmartAX MA5600T/MA5603T Brief Product Brochure", url: "http://www.german-electric.net/download/access-systems/huawei/Huawei%20SmartAX%20MA5600T%20%20MA5603T%20Brief%20Product%20Brochure(9-Feb-2012).pdf", date: "2012-02-09" },
  { id: "cfg5600", kind: "huawei", title: "SmartAX MA5600T/MA5603T/MA5608T Configuration Guide (copia en ManualsLib)", url: "https://www.manualslib.com/manual/1233685/Huawei-Smartax-Ma5603t.html" },
  { id: "pitpTs", kind: "huawei", title: "Huawei: «PITP Configuration Is Incorrect» (guía de solución de fallas)", url: "https://info.support.huawei.com/network/ptmngsys/Web/tsrev_access/en/content/access/13_IP_address_fails_to_be_obtained_through_PPPoE_dialup/trouble_511147.html" },
  { id: "iatec", kind: "reseller", title: "IA Tecnologia: GenieACS y TR-069 con ONU Huawei (MA5800, EG8145V5)", url: "https://iatecnologia.net/genieacs-tr069-onu-huawei/", date: "2026-10-04" },
  { id: "fibermall", kind: "reseller", title: "Fibermall: pérdida de inserción de splitters PLC (típica / máxima)", url: "https://www.fibermall.com/store-17106-plc-splitter.htm" },
  { id: "telecomate", kind: "reseller", title: "Telecomate: fichas MA5800 (X7, X17, MPLB, GPHF, XGHD, CGHF) y MA5603T vs MA5683T", url: "https://www.telecomate.com/huawei-ma5800-olt/" },
  { id: "thunderlink", kind: "reseller", title: "Thunder-link: fichas GPFD/GPBD y procedimiento de prueba de MA5600T", url: "https://www.thunder-link.com/huawei-smartax-ma5600t-system-test-procedure" },
  { id: "fiberolt", kind: "reseller", title: "Fiberolt: MA5608T, MA5683T, H806GPBD, H807GPBD", url: "https://www.fiberolt.com/huawei-ma5608t.html" },
  { id: "isphome", kind: "reseller", title: "ISP-Home: comparativa MA5608T / MA5683T / MA5680T", url: "https://isp-home.com/huawei-ma5600t-series-olt/" },
  { id: "gponsolution", kind: "reseller", title: "GPON Solution: desbloqueo de ONT de otras marcas (firmware R015/R018)", url: "https://gponsolution.com/huawei-olt-unlock-to-support-any-brand-ont.html" },
]

/** A value with the source that published it. */
export type Fact<T = string> = { v: T; src: string }
const h = <T>(v: T, src = "hd5600"): Fact<T> => ({ v, src })
const ds = <T>(v: T): Fact<T> => ({ v, src: "ds5600" })
const d8 = <T>(v: T): Fact<T> => ({ v, src: "ds5800" })
const r = <T>(v: T, src: string): Fact<T> => ({ v, src })

export type Family = "ma5600" | "ma5800"

export type Chassis = {
  id: string
  name: string
  /** Same hardware sold under another name (OLT-only). */
  alias?: Fact
  family: Family
  height?: Fact
  /** Width × depth × height without mounting ears, mm. */
  dimensions: Fact
  weight?: Fact
  backplane?: Fact
  serviceSlots: Fact
  controlSlots: Fact
  controlBoards: string[]
  uplinkSlots?: Fact
  powerSlots: Fact
  powerBoards: string[]
  power: Fact
  maxPower?: Fact
  fans?: Fact
  /** Max PON ports per chassis. */
  gpon?: Fact
  tenG?: Fact
  ge?: Fact
  switching?: Fact
  temperature?: Fact
  minSoftware?: Fact
}

export const CHASSIS: Chassis[] = [
  {
    id: "ma5608t",
    name: "MA5608T",
    family: "ma5600",
    height: h("2 U"),
    dimensions: h("442 × 244.5 × 88.1"),
    weight: h("3.55 kg (vacío)"),
    backplane: h("H801MABR"),
    serviceSlots: h("2 (slots 0–1)"),
    controlSlots: h("2 (slots 2–3)"),
    controlBoards: ["H801MCUD", "H801MCUD1", "H801MCUE"],
    uplinkSlots: h("Ninguno: los uplinks van en la controladora (MCUD 4 × GE; MCUD1 2 × GE/10GE + 2 × GE)"),
    powerSlots: h("1 (slot 4)"),
    powerBoards: ["H801MPWC", "H801MPWD"],
    power: h("DC −48/−60 V (−38.4 a −72 V, 10 A) o AC 110/220 V (6 A, con batería)"),
    maxPower: h("293.5 W (configuración P2P de prueba de Huawei)"),
    fans: h("Charola de 2 ventiladores, H831FCBB: 4 W / 39 W"),
    gpon: ds("32"),
    tenG: ds("8 (10G GPON)"),
    ge: ds("96"),
    switching: ds("Backplane 720 Gbit/s; MCUD/MCUD1 128 Gbit/s (activo/reserva) o 256 Gbit/s (reparto de carga)"),
    temperature: ds("−40 a +65 °C, 5–95 % HR"),
  },
  {
    id: "ma5603t",
    name: "MA5603T",
    alias: r("MA5683T: mismo chasis vendido solo como OLT", "telecomate"),
    family: "ma5600",
    height: h("6 U"),
    dimensions: h("442 × 283.2 × 263.9"),
    weight: h("7.0 kg (vacío)"),
    backplane: h("H801MABO (sin vectoring) o H802MABO (vectoring)"),
    serviceSlots: h("6 (slots 0–5)"),
    controlSlots: h("2 (slots 6–7)"),
    controlBoards: ["H801SCUL", "H801SCUN", "H802SCUN", "H801SCUH", "H801SCUV", "H801SCUB", "H801SCUF"],
    uplinkSlots: h("2 (slots 8–9, tarjetas GIU) + 1 universal (slot 12)"),
    powerSlots: h("2 (slots 10–11)"),
    powerBoards: ["H801PRTE", "H801PRTG"],
    power: h("Solo DC −48/−60 V (−38.4 a −72 V), 20 A máx."),
    maxPower: h("816.55 W (2 × SCUH + 6 × H802GPFD, prueba de Huawei)"),
    fans: h("FMCA (6 ventiladores, 30 W / 72 W) o FCBI (16 W / 67 W)"),
    gpon: ds("96"),
    tenG: ds("48 (10G GPON)"),
    ge: ds("288"),
    switching: ds("Backplane 1.5 Tbit/s (H801MABO) o 2 Tbit/s (H802MABO)"),
    temperature: ds("−40 a +65 °C, 5–95 % HR"),
  },
  {
    id: "ma5600t-etsi",
    name: "MA5600T ETSI",
    alias: r("MA5680T: mismo chasis vendido solo como OLT", "telecomate"),
    family: "ma5600",
    dimensions: h("490 × 275.8 × 447.2"),
    weight: h("33 kg máx. (con soportes)"),
    backplane: h("H801MABC"),
    serviceSlots: h("16 (slots 1–8 y 11–18)"),
    controlSlots: h("2 (slots 9–10)"),
    controlBoards: ["H801SCUL", "H801SCUN", "H802SCUN", "H801SCUH", "H801SCUV", "H801SCUB", "H801SCUF"],
    uplinkSlots: h("2 (slots 19–20, GIU) + 1 universal (slot 0)"),
    powerSlots: h("2 (slots 21–22)"),
    powerBoards: ["H801PRTE", "H801PRTG", "H801PRTA"],
    power: ds("Solo DC −48 V (−38.4 a −72 V), dos entradas"),
    maxPower: h("1810.55 W (configuración P2P); con 16 × H805GPBD: 803 W estático, 899 W típico, 995 W máx."),
    fans: h("FCBB (4 ventiladores, 23 W / 65 W) o FCBI (13 W / 67 W)"),
    gpon: ds("256"),
    tenG: ds("128 (10G GPON)"),
    ge: ds("768"),
    switching: ds("Backplane 3.2 Tbit/s; SCUN/SCUK 480/960 Gbit/s; SCUH 960/1920 Gbit/s"),
    temperature: ds("−25 a +55 °C, 5–95 % HR"),
  },
  {
    id: "ma5600t-iec",
    name: "MA5600T IEC",
    alias: r("MA5680T IEC (10 U según el revendedor)", "isphome"),
    family: "ma5600",
    dimensions: h("442 × 275.8 × 441.7"),
    weight: h("30.54 kg máx. (con soportes)"),
    backplane: h("H801MABH"),
    serviceSlots: h("14 (slots 1–6 y 9–16)"),
    controlSlots: h("2 (slots 7–8)"),
    controlBoards: ["H801SCUL", "H801SCUN", "H802SCUN", "H801SCUH", "H801SCUV", "H801SCUB", "H801SCUF"],
    uplinkSlots: h("2 (slots 17–18, GIU) + 1 universal (slot 0)"),
    powerSlots: h("2 (slots 19–20)"),
    powerBoards: ["H801PRTE", "H801PRTG", "H801PRTA"],
    power: ds("Solo DC −48 V (−38.4 a −72 V)"),
    maxPower: h("1379.55 W (configuración VDSL2 de prueba)"),
    fans: h("FCBH (10 ventiladores, 21 W / 88 W)"),
    gpon: r("224", "isphome"),
    switching: ds("Backplane 3.2 Tbit/s"),
    temperature: ds("−25 a +55 °C, 5–95 % HR"),
  },
  {
    id: "ma5800-x2",
    name: "MA5800-X2",
    family: "ma5800",
    height: d8("2 U (88.1 mm)"),
    dimensions: d8("442 × 268.7 × 88.1"),
    weight: d8("9.4 kg máx."),
    backplane: d8("H901BPSB"),
    serviceSlots: d8("2 (slots 1–2)"),
    controlSlots: d8("2 (slots 3–4)"),
    controlBoards: ["H901MPSA", "H901MPSG", "H901MPSD"],
    uplinkSlots: d8("Ninguno (sin slot universal): los uplinks van en la controladora"),
    powerSlots: d8("1 (slot 0)"),
    powerBoards: ["H901PISA", "H901PISB"],
    power: d8("DC −48/−60 V (−38.4 a −72 V, 20 A) o AC 100–240 V (8 A) con batería de respaldo"),
    gpon: d8("32"),
    tenG: d8("32 XG-PON o 32 XGS-PON"),
    ge: d8("96 GE, 16 × 10GE"),
    switching: d8("MPSA/MPSG 248 Gbit/s (40 Gbit/s por slot); MPSD 560 Gbit/s (100 Gbit/s por slot)"),
    temperature: d8("−40 a +65 °C (arranca desde −25 °C), 5–95 % HR, < 4000 m"),
    minSoftware: d8("V100R017C10"),
  },
  {
    id: "ma5800-x7",
    name: "MA5800-X7",
    family: "ma5800",
    height: d8("6 U (263.9 mm)"),
    dimensions: d8("442 × 268.7 × 263.9"),
    weight: d8("26 kg máx."),
    backplane: d8("H901BPMB"),
    serviceSlots: d8("7 (slots 1–7)"),
    controlSlots: d8("2 (slots 8–9)"),
    controlBoards: ["H901MPLA", "H901MPLB", "H901MPLG"],
    uplinkSlots: d8("1 universal (slot 0); los uplinks van en la control o en slots de servicio"),
    powerSlots: d8("2 (slots 10–11)"),
    powerBoards: ["H901PILA"],
    power: d8("DC −48/−60 V (−38.4 a −72 V), doble entrada, 40 A"),
    gpon: d8("112"),
    tenG: d8("112 XG-PON o 112 XGS-PON"),
    ge: d8("336 GE, 168 × 10GE"),
    switching: d8("MPLA 3.6 Tbit/s (100 Gbit/s por slot); MPLB 7.0 / MPLG 7.3 Tbit/s (200 Gbit/s por slot)"),
    temperature: d8("−40 a +65 °C (arranca desde −25 °C), 5–95 % HR, < 4000 m"),
    minSoftware: d8("V100R016C00"),
  },
  {
    id: "ma5800-x15",
    name: "MA5800-X15",
    family: "ma5800",
    height: d8("≈ 11 U (486 mm)"),
    dimensions: d8("442 × 287 × 486"),
    weight: d8("35 kg máx."),
    backplane: d8("H901BPIB"),
    serviceSlots: d8("15 (slots 1–7 y 10–17)"),
    controlSlots: d8("2 (slots 8–9)"),
    controlBoards: ["H901MPLA", "H901MPLB", "H901MPLG"],
    uplinkSlots: d8("1 universal (slot 0)"),
    powerSlots: d8("2 (slots 18–19)"),
    powerBoards: ["H901PILA"],
    power: d8("DC −48/−60 V (−38.4 a −72 V), doble entrada, 60 A"),
    gpon: d8("240"),
    tenG: d8("240 XG-PON o 240 XGS-PON"),
    ge: d8("720 GE, 360 × 10GE"),
    switching: d8("MPLA 3.6 Tbit/s; MPLB 7.0 / MPLG 7.3 Tbit/s"),
    temperature: d8("−40 a +65 °C (arranca desde −25 °C), 5–95 % HR, < 4000 m"),
    minSoftware: d8("V100R016C10"),
  },
  {
    id: "ma5800-x17",
    name: "MA5800-X17",
    family: "ma5800",
    height: d8("≈ 11 U (486 mm)"),
    dimensions: d8("493 × 287 × 486"),
    weight: d8("45 kg máx."),
    backplane: d8("H901BPLB"),
    serviceSlots: d8("17 (slots 1–8 y 11–19)"),
    controlSlots: d8("2 (slots 9–10)"),
    controlBoards: ["H901MPLA", "H901MPLB", "H901MPLG"],
    uplinkSlots: d8("1 universal (slot 0)"),
    powerSlots: d8("2 (slots 20–21)"),
    powerBoards: ["H901PILA"],
    power: d8("DC −48/−60 V (−38.4 a −72 V), doble entrada, 60 A"),
    gpon: d8("272"),
    tenG: d8("272 XG-PON o 272 XGS-PON"),
    ge: d8("816 GE, 408 × 10GE"),
    switching: d8("MPLA 3.6 Tbit/s; MPLB 7.0 / MPLG 7.3 Tbit/s"),
    temperature: d8("−40 a +65 °C (arranca desde −25 °C), 5–95 % HR, < 4000 m"),
  },
]

export type BoardKind = "control" | "uplink" | "gpon" | "tenG" | "combo" | "ethernet" | "power" | "fan"
export const BOARD_KINDS: BoardKind[] = ["control", "gpon", "tenG", "combo", "uplink", "ethernet", "power", "fan"]
/** EOM = end of marketing, EOP = end of production (Huawei's life-cycle table). */
export type Lifecycle = "EOM" | "EOP"

export type Board = {
  code: string
  kind: BoardKind
  family: Family
  /** Ports and interface, in a few words. */
  ports: Fact
  /** Static / max power, W. */
  power?: Fact
  /** Chassis ids it goes in. */
  chassis: string[]
  /** Control boards it works with (MA5600T family). */
  controls?: Fact<string[]>
  minVersion?: Fact
  lifecycle?: Fact<Lifecycle>
  replacedBy?: Fact<string[]>
  /** Extra fact worth knowing (one line). */
  detail?: Fact
}

const ALL_5600 = ["ma5600t-etsi", "ma5600t-iec", "ma5603t", "ma5608t"]
const BIG_5600 = ["ma5600t-etsi", "ma5600t-iec", "ma5603t"]
const ALL_5800 = ["ma5800-x2", "ma5800-x7", "ma5800-x15", "ma5800-x17"]
const BIG_5800 = ["ma5800-x7", "ma5800-x15", "ma5800-x17"]

export const BOARDS: Board[] = [
  // ── MA5600T family: control ───────────────────────────────────────────────
  { code: "H801SCUN", kind: "control", family: "ma5600", ports: h("4 × GE (óptico/eléctrico)"), power: h("41 / 62 W"), chassis: BIG_5600, replacedBy: h(["H802SCUN"]), detail: ds("480 Gbit/s activo/reserva, 960 Gbit/s reparto de carga") },
  { code: "H802SCUN", kind: "control", family: "ma5600", ports: h("4 × GE (óptico/eléctrico)"), power: h("30 / 50 W"), chassis: BIG_5600, detail: h("Compatible de slot con H801SCUN") },
  { code: "H801SCUH", kind: "control", family: "ma5600", ports: h("4 × 10GE/GE ópticos"), power: h("89 W / 111 W (10GE) o 134 W (20GE)"), chassis: BIG_5600, minVersion: h("V800R011C00"), detail: ds("960 Gbit/s activo/reserva, 1920 Gbit/s reparto de carga") },
  { code: "H801SCUV", kind: "control", family: "ma5600", ports: h("4 × 10GE ópticos"), power: h("89 W / 111–134 W"), chassis: BIG_5600, minVersion: h("V800R013C00") },
  { code: "H801SCUL", kind: "control", family: "ma5600", ports: h("Sin puertos en el panel (uplink por GIU)"), power: h("40.4 / 42.1 W"), chassis: BIG_5600, lifecycle: h("EOM"), replacedBy: h(["H801SCUN", "H802SCUN"]) },
  { code: "H801SCUB", kind: "control", family: "ma5600", ports: h("4 × GE SFP"), power: h("18.8 / 22 W"), chassis: BIG_5600, detail: h("Pensada para cobre; de GPON solo acepta GPBC") },
  { code: "H801SCUF", kind: "control", family: "ma5600", ports: h("4 × GE SFP"), power: h("22 / 25 W"), chassis: BIG_5600, detail: h("No acepta X2CA; con GICK/X2CS solo usa el primer puerto") },
  { code: "H801SCUK", kind: "control", family: "ma5600", ports: ds("Uplink GE"), chassis: BIG_5600, detail: ds("Misma capacidad que SCUN (480/960 Gbit/s); no viene en la descripción de hardware 2013") },
  { code: "H801MCUD", kind: "control", family: "ma5600", ports: h("4 × GE SFP"), power: h("24 / 26 W"), chassis: ["ma5608t"], minVersion: h("V800R012C00"), detail: ds("128 Gbit/s activo/reserva, 256 Gbit/s reparto de carga") },
  { code: "H801MCUD1", kind: "control", family: "ma5600", ports: h("2 × GE/10GE SFP+ + 2 × GE SFP, BITS/ToD"), power: h("29 / 33 W"), chassis: ["ma5608t"], minVersion: h("V800R012C00"), detail: h("Única control del MA5608T con uplink 10GE") },
  { code: "H801MCUE", kind: "control", family: "ma5600", ports: h("4 × GE SFP"), power: h("24 / 26 W"), chassis: ["ma5608t"], minVersion: h("V800R013C00"), detail: h("Para D-CMTS; no acepta H802GPBD/H805GPBD") },
  // ── MA5600T family: GPON ──────────────────────────────────────────────────
  { code: "H801GPBC", kind: "gpon", family: "ma5600", ports: h("4 × GPON, 64 ONT por puerto, 20 km, solo B+"), power: h("70.6 / 78 W"), chassis: BIG_5600, controls: h(["SCUB", "SCUL", "SCUN", "SCUH"]), lifecycle: h("EOM"), replacedBy: h(["H802GPBD", "H805GPBD", "H806GPBH"]) },
  { code: "H802GPBD", kind: "gpon", family: "ma5600", ports: h("8 × GPON, 128 ONT por puerto, 20 km, B+/C+"), power: h("45 / 51 W"), chassis: ALL_5600, controls: h(["SCUL", "SCUN", "SCUH", "MCUD", "MCUD1"]), lifecycle: h("EOM"), replacedBy: h(["H805GPBD", "H806GPBH"]), detail: h("Sin shaping por ONU") },
  { code: "H805GPBD", kind: "gpon", family: "ma5600", ports: h("8 × GPON, 128 ONT por puerto, 20 km, B+/C+"), power: h("43 / 49 W"), chassis: ALL_5600, controls: h(["SCUL", "SCUN", "SCUH", "MCUD", "MCUD1"]), detail: h("Con shaping por ONU; en MA5608T desde V800R013C10") },
  { code: "H806GPBH", kind: "gpon", family: "ma5600", ports: h("8 × GPON, 128 ONT por puerto, 40 km, B+/C+"), power: h("32 / 46 W"), chassis: ALL_5600, controls: h(["SCUL", "SCUN", "SCUH", "SCUV", "MCUD", "MCUD1", "MCUE"]) },
  { code: "H802GPFD", kind: "gpon", family: "ma5600", ports: h("16 × GPON, 128 ONT por puerto, 40 km, B+/C+"), power: h("45 / 73 W"), chassis: ALL_5600, controls: h(["SCUL", "SCUN", "SCUH", "SCUV", "MCUD", "MCUD1", "MCUE"]) },
  { code: "H805GPFD", kind: "gpon", family: "ma5600", ports: r("16 × GPON, B+/C+/C++", "thunderlink"), power: r("26 / 50 W (la misma página también dice 45–73 W)", "thunderlink"), chassis: ALL_5600, detail: r("No viene en la descripción de hardware 2013", "thunderlink") },
  { code: "H803GPFD", kind: "gpon", family: "ma5600", ports: r("16 × GPON", "thunderlink"), power: r("39 / 61 W", "thunderlink"), chassis: ALL_5600 },
  { code: "H807GPBD", kind: "gpon", family: "ma5600", ports: r("8 × GPON, hasta 1:128", "fiberolt"), power: r("25 / 38 W", "fiberolt"), chassis: ALL_5600, detail: r("HQoS de 4 niveles, jumbo de 9216 bytes", "fiberolt") },
  { code: "H801GPMD", kind: "gpon", family: "ma5600", ports: h("8 × GPON, 128 ONT por puerto, 40 km"), power: h("32 / 46 W"), chassis: BIG_5600, controls: h(["SCUV"]), minVersion: h("V800R013C00"), detail: h("Para D-CMTS (cable); en la tabla de Huawei solo con SCUV (tabla poco legible: confírmalo)") },
  // ── MA5600T family: 10G GPON ──────────────────────────────────────────────
  { code: "H802XGBC", kind: "tenG", family: "ma5600", ports: h("4 × XG-PON (XFP), división hasta 1:128"), power: h("67 / 85 W"), chassis: ALL_5600, detail: ds("Por eso el MA5608T da 8 puertos 10G GPON (2 slots × 4)") },
  { code: "H801XGBD", kind: "tenG", family: "ma5600", ports: r("8 × XG-PON", "fiberolt"), chassis: ALL_5600, detail: r("En el MA5608T y MA5683T según el revendedor; sin ficha de Huawei leída", "fiberolt") },
  // ── MA5600T family: uplink (GIU) ──────────────────────────────────────────
  { code: "H801X2CS", kind: "uplink", family: "ma5600", ports: h("2 × 10GE SFP+, SyncE"), power: h("17.6 / 18 W"), chassis: BIG_5600, controls: h(["SCUF (1 puerto)", "SCUL", "SCUN", "SCUH", "SCUV"]), detail: h("El reemplazo de X1CA/X2CA") },
  { code: "H801X2CA", kind: "uplink", family: "ma5600", ports: h("2 × 10GE XFP"), power: h("20.2 / 20.5 W"), chassis: BIG_5600, controls: h(["SCUL", "SCUN", "SCUH"]), lifecycle: h("EOM"), replacedBy: h(["H801X2CS"]) },
  { code: "H801X1CA", kind: "uplink", family: "ma5600", ports: h("1 × 10GE XFP"), power: h("11.1 / 11.3 W"), chassis: BIG_5600, controls: h(["SCUL", "SCUN", "SCUH"]), lifecycle: h("EOM"), replacedBy: h(["H801X2CS"]) },
  { code: "H801GICF", kind: "uplink", family: "ma5600", ports: h("2 × GE SFP"), power: h("3.9 W"), chassis: BIG_5600, controls: h(["SCUL", "SCUN", "SCUH"]) },
  { code: "H801GICG", kind: "uplink", family: "ma5600", ports: h("2 × GE eléctricos"), power: h("6.3 / 9.2 W"), chassis: BIG_5600, controls: h(["SCUL", "SCUN", "SCUH"]) },
  { code: "H801GICK", kind: "uplink", family: "ma5600", ports: h("2 × GE SFP, SyncE"), power: h("6.6 / 7 W"), chassis: BIG_5600, controls: h(["SCUF (1 puerto)", "SCUL", "SCUN", "SCUH", "SCUV"]) },
  { code: "H801GICE", kind: "uplink", family: "ma5600", ports: h("4 × GE eléctricos"), power: h("5.8 / 11.8 W"), chassis: BIG_5600, controls: h(["SCUB", "SCUF", "SCUH", "SCUV"]) },
  { code: "H801GSCA", kind: "uplink", family: "ma5600", ports: h("4 × GE SFP, SyncE"), power: h("8 / 10 W"), chassis: BIG_5600, controls: h(["SCUB", "SCUF"]) },
  { code: "H802P2CA", kind: "uplink", family: "ma5600", ports: h("2 × PON SFP (GPON/EPON) como uplink"), power: h("9 / 10 W"), chassis: BIG_5600 },
  { code: "H801GICD", kind: "uplink", family: "ma5600", ports: h("4 × GE SFP"), power: h("5.3 W"), chassis: BIG_5600, controls: h(["SCUB", "SCUF", "SCUH", "SCUV"]) },
  // ── MA5600T family: Ethernet / P2P ────────────────────────────────────────
  { code: "H801ETHB", kind: "ethernet", family: "ma5600", ports: h("8 × GE ópticos o eléctricos"), power: h("20 / 21 W"), chassis: ALL_5600, detail: h("Uplink extra, cascada y agregación entre tarjetas") },
  { code: "H801ETHA", kind: "ethernet", family: "ma5600", ports: h("8 × GE SFP (en dos subtarjetas O4GS)"), power: h("19.6 / 27 W"), chassis: BIG_5600, lifecycle: h("EOP"), replacedBy: h(["H801ETHB"]) },
  { code: "H801OPFA", kind: "ethernet", family: "ma5600", ports: h("16 × FE ópticos (eSFF), P2P"), power: h("20.2 / 28.5 W"), chassis: BIG_5600, controls: h(["SCUB", "SCUF", "SCUL", "SCUN", "SCUH"]) },
  { code: "H802OPGD", kind: "ethernet", family: "ma5600", ports: h("24 o 48 × GE/FE, P2P"), power: h("70 / 100 W"), chassis: BIG_5600 },
  { code: "H802OPGE", kind: "ethernet", family: "ma5600", ports: h("24 o 48 × GE/FE ópticos, 1588v2/SyncE"), power: h("53 / 90 W"), chassis: ALL_5600, detail: ds("Agregación, P2P a empresas y backhaul móvil") },
  // ── MA5600T family: power and fans ────────────────────────────────────────
  { code: "H801PRTE", kind: "power", family: "ma5600", ports: h("1 entrada −48 V DC, filtro, límite de corriente, bajo voltaje"), power: h("1.5 W"), chassis: BIG_5600, detail: h("El reemplazo de PRTA y PRTG") },
  { code: "H801PRTG", kind: "power", family: "ma5600", ports: h("1 entrada −48 V DC, solo filtro"), power: h("0.2 W"), chassis: BIG_5600, lifecycle: h("EOM"), replacedBy: h(["H801PRTE"]) },
  { code: "H801PRTA", kind: "power", family: "ma5600", ports: h("1 entrada −48 V DC"), power: h("1.5 W"), chassis: ["ma5600t-etsi", "ma5600t-iec"], lifecycle: h("EOP"), replacedBy: h(["H801PRTE"]) },
  { code: "H801MPWC", kind: "power", family: "ma5600", ports: h("2 entradas −48 V DC (10 A cada una)"), power: h("2.5 W"), chassis: ["ma5608t"], minVersion: h("V800R012C00") },
  { code: "H801MPWD", kind: "power", family: "ma5600", ports: h("AC 100–240 V, 6 A; salida −48 V, 400 W; entrada de batería"), power: h("2 W; eficiencia máx. 93 %"), chassis: ["ma5608t"], minVersion: h("V800R012C00") },
  { code: "H801FCBI", kind: "fan", family: "ma5600", ports: h("Charola de ventiladores ETSI o MA5603T"), power: h("13–16 / 67 W"), chassis: ["ma5600t-etsi", "ma5603t"], detail: h("Reemplaza a FCBB (ETSI) y a FMCA (MA5603T)") },
  { code: "H801FCBH", kind: "fan", family: "ma5600", ports: h("Charola IEC, 10 ventiladores"), power: h("21 / 88 W"), chassis: ["ma5600t-iec"], detail: h("Reemplaza a FCBC") },
  { code: "H831FCBB", kind: "fan", family: "ma5600", ports: h("Charola MA5608T, 2 ventiladores"), power: h("4 / 39 W"), chassis: ["ma5608t"], minVersion: h("V800R012C00") },
  // ── MA5800 ────────────────────────────────────────────────────────────────
  { code: "H901MPLB", kind: "control", family: "ma5800", ports: d8("4 × 10GE/GE por tarjeta (8 con dos tarjetas)"), chassis: BIG_5800, detail: d8("7.0 Tbit/s, 200 Gbit/s por slot") },
  { code: "H901MPLA", kind: "control", family: "ma5800", ports: d8("4 × 10GE/GE por tarjeta"), chassis: BIG_5800, detail: d8("3.6 Tbit/s, 100 Gbit/s por slot") },
  { code: "H901MPLG", kind: "control", family: "ma5800", ports: d8("2 × 100GE + 4 × 10GE/GE (con dos tarjetas)"), chassis: BIG_5800, detail: d8("7.3 Tbit/s, 200 Gbit/s por slot") },
  { code: "H901MPSA", kind: "control", family: "ma5800", ports: d8("4 × 10GE/GE + 4 × GE (con dos tarjetas)"), chassis: ["ma5800-x2"], detail: d8("248 Gbit/s, 40 Gbit/s por slot (igual MPSG)") },
  { code: "H901MPSD", kind: "control", family: "ma5800", ports: d8("8 × 10GE/GE (MPSD-G)"), chassis: ["ma5800-x2"], detail: d8("560 Gbit/s, 100 Gbit/s por slot") },
  { code: "H901MPSG", kind: "control", family: "ma5800", ports: d8("4 × 10GE/GE + 4 × GE (con dos tarjetas)"), chassis: ["ma5800-x2"], detail: d8("248 Gbit/s, 40 Gbit/s por slot (igual MPSA)") },
  { code: "H901MPSC", kind: "control", family: "ma5800", ports: r("4 × 10GE/GE", "telecomate"), chassis: ["ma5800-x2"], detail: r("80 Gbit/s por slot; con entradas de alarma y reloj BITS/ToD", "telecomate") },
  { code: "H901GPSF", kind: "gpon", family: "ma5800", ports: r("16 × GPON", "telecomate"), chassis: ALL_5800 },
  { code: "H901GPUF", kind: "gpon", family: "ma5800", ports: r("16 × GPON", "telecomate"), chassis: ALL_5800 },
  { code: "H901GPLF", kind: "gpon", family: "ma5800", ports: r("16 × GPON", "telecomate"), chassis: ALL_5800 },
  { code: "H901XGSF", kind: "tenG", family: "ma5800", ports: r("16 × XG-PON", "telecomate"), chassis: ALL_5800 },
  { code: "H902XSHD", kind: "tenG", family: "ma5800", ports: r("8 × XGS-PON", "telecomate"), chassis: ALL_5800 },
  { code: "H901TWED", kind: "tenG", family: "ma5800", ports: r("8 × TWDM-PON", "telecomate"), chassis: ALL_5800 },
  { code: "H902CGHD", kind: "combo", family: "ma5800", ports: r("8 × combo XG-PON + GPON, 100 Gbit/s", "telecomate"), chassis: ALL_5800 },
  { code: "H902CSHD", kind: "combo", family: "ma5800", ports: r("8 × combo XGS-PON + GPON, 100 Gbit/s", "telecomate"), chassis: ALL_5800 },
  { code: "H901GPHF", kind: "gpon", family: "ma5800", ports: r("16 × GPON, B+/C+/C++, 1:64 (B+) o 1:128 (C+/C++)", "telecomate"), power: r("25 / 50 W", "telecomate"), chassis: ALL_5800 },
  { code: "H901XGHD", kind: "tenG", family: "ma5800", ports: r("8 × XG-PON (N1/N2a), 1:256", "telecomate"), power: r("42 / 61 W", "telecomate"), chassis: ALL_5800 },
  { code: "H901XSHF", kind: "tenG", family: "ma5800", ports: r("16 × XGS-PON", "telecomate"), chassis: ALL_5800 },
  { code: "H901CGHF", kind: "combo", family: "ma5800", ports: r("16 × combo XG-PON + GPON (C+ o N2a), GPON 1:128, XG-PON 1:256", "telecomate"), power: r("48 / 106 W", "telecomate"), chassis: ALL_5800 },
  { code: "H901CSHF", kind: "combo", family: "ma5800", ports: r("16 × combo XGS-PON + GPON, 200 Gbit/s, GPON 1:128, XGS-PON 1:256", "telecomate"), chassis: ALL_5800, detail: r("Cada puerto sirve a ONT GPON y XGS-PON a la vez: subes a XGS-PON sin cambiar los ONT actuales", "telecomate") },
  { code: "H901FLHF", kind: "combo", family: "ma5800", ports: d8("16 × Flex-PON: GPON, XG-PON, XGS-PON, combos o TWDM según el módulo óptico"), chassis: ALL_5800 },
  { code: "H901NXED", kind: "uplink", family: "ma5800", ports: r("8 × 10GE/GE", "telecomate"), chassis: BIG_5800 },
  { code: "H902NCEB", kind: "uplink", family: "ma5800", ports: r("2 × 100GE", "telecomate"), chassis: BIG_5800 },
  { code: "H901PILA", kind: "power", family: "ma5800", ports: r("Entrada −48 V DC", "telecomate"), chassis: BIG_5800 },
  { code: "H901PISB", kind: "power", family: "ma5800", ports: r("AC (MA5800-X2)", "telecomate"), chassis: ["ma5800-x2"] },
  { code: "H901PISA", kind: "power", family: "ma5800", ports: r("DC (MA5800-X2)", "telecomate"), chassis: ["ma5800-x2"] },
]

/** GPON/XG-PON optical module classes. */
export type OpticClass = { id: string; budget: Fact; tx?: Fact; sensitivity?: Fact; split: Fact; use: string }
export const OPTICS: OpticClass[] = [
  { id: "B+", budget: h("28.5 dB"), tx: r("+1.5 a +5 dBm", "thunderlink"), sensitivity: r("−28 dBm", "thunderlink"), split: r("1:64 en la práctica", "telecomate"), use: "bPlus" },
  { id: "C+", budget: h("32 dB"), tx: r("+3 a +7 dBm", "thunderlink"), sensitivity: r("−32 dBm", "thunderlink"), split: h("1:128 (Huawei pide C+ para llegar a 1:128)", "brochure5600"), use: "cPlus" },
  { id: "C++", budget: r("35 dB", "telecomate"), tx: r("+6 a +10 dBm", "thunderlink"), sensitivity: r("−35 dBm", "thunderlink"), split: r("1:128", "telecomate"), use: "cPlusPlus" },
  { id: "N1 / N2a (XG-PON)", budget: r("N1 / N2a", "telecomate"), split: r("1:256", "telecomate"), use: "xg" },
]

/** PLC splitter insertion loss, maximum dB (connectorized), by ratio. */
export const SPLITTERS: { ratio: number; loss: Fact<number> }[] = [
  { ratio: 2, loss: r(4.0, "fibermall") },
  { ratio: 4, loss: r(7.4, "fibermall") },
  { ratio: 8, loss: r(10.7, "fibermall") },
  { ratio: 16, loss: r(14.0, "fibermall") },
  { ratio: 32, loss: r(17.2, "fibermall") },
  { ratio: 64, loss: r(21.5, "fibermall") },
]

/** Optical budget per class, dB (for the calculator; same figures as OPTICS). */
export const BUDGETS: { id: string; budget: Fact<number> }[] = [
  { id: "B+", budget: h(28.5) },
  { id: "C+", budget: h(32) },
  { id: "C++", budget: r(35, "telecomate") },
]

/** OLT commands worth having at hand, each from the source that shows it (what it does: messages olt.commands.items.<id>). */
export type Command = { id: string; cmd: string; src: string; group: "check" | "ont" | "save" }
export const COMMANDS: Command[] = [
  { id: "version", cmd: "display version", src: "thunderlink", group: "check" },
  { id: "boards", cmd: "display board 0", src: "thunderlink", group: "check" },
  { id: "board", cmd: "display board 0/<slot>", src: "thunderlink", group: "check" },
  { id: "pitpConfig", cmd: "display pitp config", src: "pitpTs", group: "check" },
  { id: "autofind", cmd: "display ont autofind all", src: "cfg5600", group: "ont" },
  { id: "ontAdd", cmd: "interface gpon 0/<slot>\n ont add <puerto> <ont-id> sn-auth \"<SN>\" omci ont-lineprofile-id <id> ont-srvprofile-id <id> desc \"<cliente>\"", src: "cfg5600", group: "ont" },
  { id: "servicePort", cmd: "service-port <índice> vlan <vlan> gpon 0/<slot>/<puerto> ont <ont-id> gemport 1 multi-service user-vlan <vlan>", src: "cfg5600", group: "ont" },
  { id: "servicePorts", cmd: "display service-port all", src: "cfg5600", group: "ont" },
  { id: "pitpPort", cmd: "pitp permit-forwarding service-port <índice> enable", src: "pitpTs", group: "ont" },
  { id: "wanInfo", cmd: "display ont wan-info 0/<slot> <puerto> <ont-id>", src: "iatec", group: "ont" },
  { id: "save", cmd: "save", src: "iatec", group: "save" },
]

export const sourceOf = (id: string) => SOURCES.find((s) => s.id === id)
export const chassisName = (id: string) => CHASSIS.find((c) => c.id === id)?.name ?? id
