/**
 * Knowledge base for Huawei SmartAX OLTs (MA5600T family and MA5800), for buying and replacing equipment
 * (owner, 2026-11-16). Internal page /olt.
 *
 * Every figure names its source. "huawei" = a Huawei document (hardware description, datasheet) read through a
 * public mirror; "reseller" = a seller's page (useful, not authoritative). Nothing here is invented: a value nobody
 * published is left out (undefined) and the page says so.
 */

/** "standard" = a standards body or public registry (ITU-T, NIST NVD). */
export type SourceKind = "huawei" | "reseller" | "standard"
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
  { id: "airlive", kind: "reseller", title: "AirLive: GPON OLT SFP C+++/C++++, hoja de especificaciones", url: "https://www.airlive.com/data/download/file/Airlive%20GPON%20OLT%20SFP%20C+++_SpecSheet_07072023.pdf", date: "2023-07-07" },
  { id: "vsol", kind: "reseller", title: "VSOL: GPON OLT SFP C++++", url: "https://www.vsolcn.com/product/gpon-olt-sfp-c-optical-module" },
  { id: "philisun", kind: "reseller", title: "Philisun: C+++ 9 dBm GPON OLT SFP", url: "https://www.philisun.com/products/gpon-olt-c-9dbm-2g-1g-1490-1310nm-20km-sc-sx/" },
  { id: "eg8145", kind: "huawei", title: "Huawei OptiXstar EG8145B7-50 (página de producto)", url: "https://e.huawei.com/en/products/optical-terminal/optixstar-eg8145b7-50" },
  { id: "telecomate", kind: "reseller", title: "Telecomate: fichas MA5800 (X7, X17, MPLB, GPHF, XGHD, CGHF) y MA5603T vs MA5683T", url: "https://www.telecomate.com/huawei-ma5800-olt/" },
  { id: "thunderlink", kind: "reseller", title: "Thunder-link: fichas GPFD/GPBD y procedimiento de prueba de MA5600T", url: "https://www.thunder-link.com/huawei-smartax-ma5600t-system-test-procedure" },
  { id: "fiberolt", kind: "reseller", title: "Fiberolt: MA5608T, MA5683T, H806GPBD, H807GPBD", url: "https://www.fiberolt.com/huawei-ma5608t.html" },
  { id: "isphome", kind: "reseller", title: "ISP-Home: comparativa MA5608T / MA5683T / MA5680T", url: "https://isp-home.com/huawei-ma5600t-series-olt/" },
  { id: "gponsolution", kind: "reseller", title: "GPON Solution: desbloqueo de ONT de otras marcas (firmware R015/R018)", url: "https://gponsolution.com/huawei-olt-unlock-to-support-any-brand-ont.html" },
  // Optical modules (part numbers), 10G classes.
  { id: "gponModules", kind: "reseller", title: "GPON Solution: módulos ópticos PON de Huawei (BOM, clase, potencia, sensibilidad)", url: "https://gponsolution.com/huawei-pon-sfp-gpon-xgpon-optical-modules.html", date: "2026-06-08" },
  { id: "tlBplus", kind: "reseller", title: "Thunder-link: GPON OLT Class B+ (34060337-1, OSG002001) y tarjetas donde va", url: "https://www.thunder-link.com/gpon-olt-class-b-plus_p1843.html" },
  { id: "tlCplus", kind: "reseller", title: "Thunder-link: GPON OLT Class C+ (34060694-2, OSX002003)", url: "https://www.thunder-link.com/gpon-olt-class-c-plus_p1845.html" },
  { id: "fiberoltCpp", kind: "reseller", title: "Fiberolt: Huawei 34060841 GPON OLT Class C++ SFP", url: "https://www.fiberolt.com/huawei-34060841-gpon-olt-class-c-plus-plus-sfp.html" },
  { id: "edgeoptic", kind: "reseller", title: "Edgeoptic: módulo GPON compatible con Huawei (memoria EEPROM codificada)", url: "https://edgeoptic.com/products/huawei/h87mma5671a2", date: "2026-01-16" },
  { id: "g9807", kind: "standard", title: "ITU-T G.9807.1 (02/2023): XGS-PON (clases N1, N2, E1, E2 heredadas de XG-PON, G.987.2)", url: "https://www.itu.int/epublications/publication/itu-t-g-9807-1-2023-02-10-gigabit-capable-symmetric-passive-optical-network-xgs-pon", date: "2023-02" },
  // ONTs.
  { id: "pondeskB7", kind: "reseller", title: "Pondesk: Huawei OptiXstar EG8145B7-50, ficha técnica", url: "https://pondesk.com/product/huawei-optixstar-eg8145b7-50-gpon-and-wi-fi-7-routing-type-ont-foel-032" },
  { id: "ponplanetB7N", kind: "reseller", title: "PON Planet: Huawei OptiXstar EG8145B7N-50", url: "https://www.ponplanet.eu/en/optixstar-eg8145b7n-50/" },
  { id: "dsEN8145", kind: "huawei", title: "Huawei OptiXstar EN8145B7Ns Datasheet 01", url: "https://www.ponplanet.eu/user/related_files/huawei_optixstar_en8145b7ns_datasheet_01.pdf" },
  { id: "dsX6", kind: "huawei", title: "Huawei OptiXstar EG8145X6-10 Datasheet 01", url: "https://aleashop.es/documentacion/EG8145X6-10.pdf" },
  // Software and troubleshooting.
  { id: "psirt", kind: "huawei", title: "Huawei PSIRT huawei-sa-20200401-01: desbordamiento de búfer (CVE-2020-9067)", url: "https://www.huawei.com/en/psirt/security-advisories/2020/huawei-sa-20200401-01-overflow-en", date: "2020-04-01" },
  { id: "nvd", kind: "standard", title: "NIST NVD: CVE-2020-9067 (versiones afectadas, CVSS 8.0)", url: "https://nvd.nist.gov/vuln/detail/CVE-2020-9067" },
  { id: "hdPatch", kind: "huawei", title: "SmartAX MA5600T Hardware Description (copia en ManualsLib, p. 172): tarjetas que piden parche en V800R017C10/V800R018C00", url: "https://www.manualslib.com/manual/2092344/Huawei-Smartax-Ma5600t.html?page=172" },
  { id: "huaweiTs", kind: "huawei", title: "Huawei: «GPON ONU frequently goes online and offline» (manejo de alarmas)", url: "https://info.support.huawei.com/network/ptmngsys/Web/tsrev_access/en/content/access/20_gpononu_frequently_goes_online_and_offline/trouble_510802.html" },
  { id: "iatecOnu", kind: "reseller", title: "IA Tecnologia: ONU con LOS u offline en OLT Huawei, diagnóstico completo", url: "https://iatecnologia.net/onu-los-offline-olt-huawei/" },
  // Power.
  { id: "etp4890", kind: "huawei", title: "ETP4890-A2 Embedded Power User Manual, Issue 10 (copia publicada por una tienda)", url: "https://cdn.awsli.com.br/147/147951/arquivos/ETP4890-A2%20Embedded%20Power%20User%20Manual.pdf", date: "2017-11-28" },
  { id: "hd5800", kind: "huawei", title: "MA5800 Hardware Description (copia en Scribd; leída por los extractos del buscador)", url: "https://www.scribd.com/document/431825818/MA5800-Hardware-Description" },
  { id: "tlPila", kind: "reseller", title: "Thunder-link: H901PILA (tarjeta de energía DC del MA5800)", url: "https://www.thunder-link.com/h901pila.html" },
  { id: "tlEtp48100", kind: "reseller", title: "Thunder-link: ETP48100-A1-50A, sistema de energía −48 V", url: "https://www.thunder-link.com/etp48100-a1-50a" },
  { id: "tlEps30", kind: "reseller", title: "Thunder-link: EPS30-4815AF-15A, sistema de energía −48 V", url: "https://www.thunder-link.com/EPS30-4815AF-15A_p682.html" },
  { id: "tlEps75", kind: "reseller", title: "Thunder-link: EPS75-4815AF-45A, sistema de energía −48 V", url: "https://www.thunder-link.com/eps75-4815af-45a_p709/" },
  { id: "tlOnu", kind: "reseller", title: "Thunder-link: Failure to go online of a GPON ONU", url: "https://www.thunder-link.com/failure-to-go-online-of-a-gpon-onu/", date: "2024-05-21" },
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
    powerBoards: ["H801MPWC", "H801MPWD", "H801MPWE"],
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
  { code: "H801MPWE", kind: "power", family: "ma5600", ports: ds("1 entrada −48 V DC (tarjeta DC sencilla)"), chassis: ["ma5608t"], detail: ds("Solo aparece en la lista de partes del datasheet; sin ficha en la descripción de hardware") },
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
  { code: "H901PILA", kind: "power", family: "ma5800", ports: r("1 entrada −48/−60 V DC (−38.4 a −72 V) por 2 terminales OT de 100 A", "tlPila"), power: r("0.5 / 4 W", "tlPila"), chassis: BIG_5800, detail: r("Número de parte 03022RVX; dos tarjetas = doble alimentación", "tlPila") },
  { code: "H901PISB", kind: "power", family: "ma5800", ports: h("1 entrada AC 220 V o 110 V, salida de 600 W, respaldo con batería", "hd5800"), chassis: ["ma5800-x2"] },
  { code: "H901PISA", kind: "power", family: "ma5800", ports: r("DC (MA5800-X2)", "telecomate"), chassis: ["ma5800-x2"] },
]

/** GPON/XG-PON optical module classes. */
export type OpticClass = { id: string; budget: Fact; tx?: Fact; sensitivity?: Fact; split?: Fact; use: string }
export const OPTICS: OpticClass[] = [
  { id: "B+", budget: h("28.5 dB"), tx: r("+1.5 a +5 dBm", "thunderlink"), sensitivity: r("−28 dBm", "thunderlink"), split: r("1:64 en la práctica", "telecomate"), use: "bPlus" },
  { id: "C+", budget: h("32 dB"), tx: r("+3 a +7 dBm", "thunderlink"), sensitivity: r("−32 dBm", "thunderlink"), split: h("1:128 (Huawei pide C+ para llegar a 1:128)", "brochure5600"), use: "cPlus" },
  { id: "C++", budget: r("35 dB", "telecomate"), tx: r("+6 a +10 dBm", "thunderlink"), sensitivity: r("−35 dBm", "thunderlink"), split: r("1:128", "telecomate"), use: "cPlusPlus" },
  { id: "C+++", budget: r("No publicado (la calculadora lo estima)", "airlive"), tx: r("+6 a +10 dBm (Philisun: +8 a +11)", "airlive"), sensitivity: r("−33 dBm (Philisun: −31)", "airlive"), use: "cPlus3" },
  { id: "C++++", budget: r("No publicado (la calculadora lo estima)", "airlive"), tx: r("+9 a +13 dBm (igual VSOL)", "airlive"), sensitivity: r("−33 dBm (igual VSOL)", "airlive"), use: "cPlus4" },
  { id: "N1 / N2a / E1 (XG-PON)", budget: r("29 / 31 / 33 dB", "g9807"), tx: r("Combo Huawei: +5 a +8 (C+), +8 a +12 (D)", "gponModules"), sensitivity: r("Combo Huawei: −30.5 (C+), −33.5 (D)", "gponModules"), split: r("1:256", "telecomate"), use: "xg" },
  { id: "N1 / N2 / E1 (XGS-PON)", budget: r("29 / 31 / 33 dB", "g9807"), tx: r("Combo Huawei: +5 a +8 (C+), +6 a +11 (D)", "gponModules"), sensitivity: r("Combo Huawei: −29 (C+), −32 (D)", "gponModules"), split: r("1:256", "telecomate"), use: "xgs" },
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

/**
 * OLT module classes for the calculator. B+/C+/C++ have a published class budget; C+++/C++++ (vendor extensions, not
 * ITU classes) only publish transmit power and sensitivity, so their budget is computed from both directions.
 * txMax: the strongest the module transmits (for the ONT overload check; unknown for the ITU 10G classes, so no check).
 * 10G (XG-PON, XGS-PON): the ITU classes' budgets, and Huawei's combo modules computed from the transmit power and
 * sensitivity of their 10G side (a reseller's table of Huawei BOMs).
 */
export type PonKind = "gpon" | "xgpon" | "xgspon"
export const PON_KINDS: PonKind[] = ["gpon", "xgpon", "xgspon"]
export type BudgetClass = { id: string; tech: PonKind; budget?: Fact<number>; txMin?: Fact<number>; txMax?: Fact<number>; sensitivity?: Fact<number> }
export const BUDGETS: BudgetClass[] = [
  { id: "B+", tech: "gpon", budget: h(28.5), txMax: r(5, "thunderlink") },
  { id: "C+", tech: "gpon", budget: h(32), txMax: r(7, "thunderlink") },
  { id: "C++", tech: "gpon", budget: r(35, "telecomate"), txMax: r(10, "thunderlink") },
  { id: "C+++", tech: "gpon", txMin: r(6, "airlive"), txMax: r(10, "airlive"), sensitivity: r(-33, "airlive") },
  { id: "C++++", tech: "gpon", txMin: r(9, "airlive"), txMax: r(13, "airlive"), sensitivity: r(-33, "airlive") },
  { id: "N1", tech: "xgpon", budget: r(29, "g9807") },
  { id: "N2a", tech: "xgpon", budget: r(31, "g9807") },
  { id: "E1", tech: "xgpon", budget: r(33, "g9807") },
  { id: "Combo C+ (34062632)", tech: "xgpon", txMin: r(5, "gponModules"), txMax: r(8, "gponModules"), sensitivity: r(-30.5, "gponModules") },
  { id: "Combo D (34062018)", tech: "xgpon", txMin: r(8, "gponModules"), txMax: r(12, "gponModules"), sensitivity: r(-33.5, "gponModules") },
  { id: "N1", tech: "xgspon", budget: r(29, "g9807") },
  { id: "N2", tech: "xgspon", budget: r(31, "g9807") },
  { id: "E1", tech: "xgspon", budget: r(33, "g9807") },
  { id: "Combo C+ (34062610)", tech: "xgspon", txMin: r(5, "gponModules"), txMax: r(8, "gponModules"), sensitivity: r(-29, "gponModules") },
  { id: "Combo D (34062990)", tech: "xgspon", txMin: r(6, "gponModules"), txMax: r(11, "gponModules"), sensitivity: r(-32, "gponModules") },
]

/** The company's ONT (EG8145B7-50): GPON Class B+, receiver sensitivity −27 dBm. */
export const ONT_SENSITIVITY: Fact<number> = h(-27, "eg8145")
/** Huawei's XGS-PON Wi-Fi 7 ONT (EN8145B7Ns): Class XGSN2, receiver sensitivity −28 dBm (datasheet). */
export const XGS_ONT_SENSITIVITY: Fact<number> = h(-28, "dsEN8145")

// ── Optical modules (part numbers) ──────────────────────────────────────────

export type ModuleTech = "gpon" | "comboXg" | "comboXgs"
/** A Huawei PON module by its BOM (part number). Values from one reseller's table unless the fact says otherwise. */
export type OpticModule = {
  bom: string
  model: string
  tech: ModuleTech
  form: string
  cls: string
  /** Transmit power, dBm (combo: GPON / 10G side). */
  tx: Fact
  /** Receiver sensitivity, dBm. */
  rx: Fact
  km: Fact
  /** One line worth knowing (other sources, conflicts). */
  note?: Fact
}
const g = <T>(v: T): Fact<T> => ({ v, src: "gponModules" })
export const MODULES: OpticModule[] = [
  { bom: "34060337", model: "OSG002001", tech: "gpon", form: "SFP", cls: "B+", tx: g("+1.5 a +5"), rx: g("−28"), km: g("40"), note: r("Thunder-link lo vende como 34060337-1 y le da 20 km", "tlBplus") },
  { bom: "34060694", model: "OSX002003", tech: "gpon", form: "SFP", cls: "C+", tx: g("+3 a +7"), rx: g("−32"), km: g("60"), note: r("El BOM de C+ que más vendedores usan (34060694-2 en Thunder-link)", "tlCplus") },
  { bom: "34060499", model: "OSG002004", tech: "gpon", form: "SFP", cls: "C+", tx: g("+3 a +7"), rx: g("−32"), km: g("60"), note: g("Conector PC (los demás UPC); solo esta fuente da este BOM") },
  { bom: "34061415", model: "OSG002010", tech: "gpon", form: "SFP", cls: "C+ industrial", tx: g("+3 a +7"), rx: g("−32"), km: g("60") },
  { bom: "34062607", model: "C+ Pro", tech: "gpon", form: "SFP", cls: "C+ Pro", tx: g("+3 a +10"), rx: g("−32 / −35"), km: g("60") },
  { bom: "34062777", model: "OSG006001", tech: "gpon", form: "SFP doble (2 × SC)", cls: "C+", tx: g("+3 a +7"), rx: g("−32"), km: g("60"), note: g("Dos puertos PON en un módulo") },
  { bom: "34060841", model: "OSG002008", tech: "gpon", form: "SFP", cls: "C++", tx: r("+6 a +10", "fiberoltCpp"), rx: r("−35 (sobrecarga −15)", "fiberoltCpp"), km: r("20", "fiberoltCpp"), note: g("GPON Solution lo llama «clase D» con las mismas cifras") },
  { bom: "34062632", model: "OSGXGC+02", tech: "comboXg", form: "SFP+", cls: "C+", tx: g("+4.5 a +8.5 / +5 a +8"), rx: g("−32 / −30.5"), km: g("20") },
  { bom: "34062608", model: "OSGXGCC+Pro", tech: "comboXg", form: "SFP+", cls: "C+ Pro", tx: g("+4.5 a +8.5 / +5 a +9"), rx: g("−32 / −30.5"), km: g("20") },
  { bom: "34062018", model: "OSGXGD01", tech: "comboXg", form: "SFP+", cls: "D", tx: g("+6 a +10 / +8 a +12"), rx: g("−35 / −33.5"), km: g("20") },
  { bom: "34062610", model: "OSGXGSC+01", tech: "comboXgs", form: "SFP+", cls: "C+", tx: g("+5 a +8 / +5 a +8"), rx: g("−32 / −29"), km: g("20") },
  { bom: "34062495", model: "OSGXGSC+02", tech: "comboXgs", form: "SFP+", cls: "C+ industrial", tx: g("+5 a +8 / +5 a +8"), rx: g("−32 / −29"), km: g("20") },
  { bom: "34062990", model: "OSGXGSD40", tech: "comboXgs", form: "SFP+", cls: "D", tx: g("+6 a +10 / +6 a +11"), rx: g("−35 / −32"), km: g("40") },
  { bom: "34062938", model: "OSGXGSC+03", tech: "comboXgs", form: "SFP+ doble (2 × SC)", cls: "C+", tx: g("+5 a +8 / +5 a +8"), rx: g("−32 / −29"), km: g("20") },
]
/** Boards the GPON modules go in, per the sellers. */
export const GPON_MODULE_BOARDS: Fact<string[]>[] = [r(["GPBD", "GPFD", "GPHF", "GPSF", "GPLF"], "tlBplus"), r(["GPBD", "GPFD", "GPHF", "GPUF", "GPSF"], "fiberoltCpp")]

// ── ONTs ────────────────────────────────────────────────────────────────────

export type Ont = {
  model: string
  pon: Fact
  ports: Fact
  wifi: Fact
  /** Air interface rate per band. */
  rates: Fact
  optics: Fact
  power: Fact
  size: Fact
  /** The one the company hands out today. */
  ours?: boolean
}
export const ONTS: Ont[] = [
  {
    model: "EG8145B7-50",
    ours: true,
    pon: r("GPON clase B+", "pondeskB7"),
    ports: h("4 × GE, 1 POTS, 1 USB", "eg8145"),
    wifi: r("Wi-Fi 7, 2.4 + 5 GHz, 2 × 2, 160 MHz, 4096-QAM, MLO", "pondeskB7"),
    rates: r("688 + 2882 Mbps", "pondeskB7"),
    optics: r("Sensibilidad −27 dBm, sobrecarga −8 dBm, 1310 / 1490 nm, SC/APC", "pondeskB7"),
    power: r("5 W estático / 12.5 W máx.", "pondeskB7"),
    size: r("40 × 150 × 108 mm, 293 g", "pondeskB7"),
  },
  {
    model: "EG8145B7N-50",
    pon: r("GPON clase B+", "ponplanetB7N"),
    ports: r("1 × 2.5GE + 3 × GE, 1 POTS, 1 USB 2.0", "ponplanetB7N"),
    wifi: r("Wi-Fi 7, 2.4 + 5 GHz, 2 × 2, 4096-QAM", "ponplanetB7N"),
    rates: r("688 + 2882 Mbps", "ponplanetB7N"),
    optics: r("SC/APC (sensibilidad no publicada en la ficha)", "ponplanetB7N"),
    power: r("~5 W estático / ~14 W máx.", "ponplanetB7N"),
    size: r("40 × 150 × 108 mm, 282 g", "ponplanetB7N"),
  },
  {
    model: "EN8145B7Ns",
    pon: h("XGS-PON clase XGSN2, 9.953 / 9.953 Gbit/s", "dsEN8145"),
    ports: h("1 × 2.5GE + 3 × GE, 1 POTS, 1 USB 2.0", "dsEN8145"),
    wifi: h("Wi-Fi 7, 2.4 + 5 GHz, 2 × 2, 160 MHz, 4096-QAM, MLO", "dsEN8145"),
    rates: h("688 + 2882 Mbps", "dsEN8145"),
    optics: h("Sensibilidad −28 dBm, subida 1260–1280 nm, bajada 1575–1580 nm, SC/APC", "dsEN8145"),
    power: h("6.6 W estático / 18 W máx.", "dsEN8145"),
    size: h("157 × 250 × 30 mm, 543 g (vertical o en pared)", "dsEN8145"),
  },
  {
    model: "EG8145X6-10",
    pon: h("GPON clase B+", "dsX6"),
    ports: h("4 × GE, 1 POTS, 1 USB 2.0", "dsX6"),
    wifi: h("Wi-Fi 6, 2.4 + 5 GHz, 2 × 2, 160 MHz, 1024-QAM", "dsX6"),
    rates: h("574 + 2402 Mbps", "dsX6"),
    optics: h("Sensibilidad −27 dBm, sobrecarga −8 dBm, 1310 / 1490 nm, SC/APC", "dsX6"),
    power: h("6.6 W estático / 12 W máx.", "dsX6"),
    size: h("35 × 155 × 105 mm, 246 g", "dsX6"),
  },
]

// ── Software versions ───────────────────────────────────────────────────────

/** "V800R013C10" → sortable [800, 13, 10]; null when it isn't a version. */
export function versionKey(v: string): number[] | null {
  const m = /^V(\d{3})R(\d{3})C(\d{2})/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}
export const compareVersions = (a: string, b: string) => {
  const x = versionKey(a) ?? [0, 0, 0]
  const y = versionKey(b) ?? [0, 0, 0]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/** Versions a known vulnerability affects, per family (CVE-2020-9067: buffer overflow when the device works as an OLT). */
export const CVE_9067 = {
  id: "CVE-2020-9067",
  score: r("CVSS 3.1: 8.0", "nvd"),
  ma5600: r(["V800R013C10", "V800R015C00", "V800R015C10", "V800R017C00", "V800R017C10", "V800R018C00", "V800R018C10"], "nvd"),
  ma5800: r(["V100R017C00", "V100R017C10", "V100R018C00", "V100R018C10", "V100R019C10"], "nvd"),
  fix: h("Huawei publicó parches; para MA5600T V800R013C10 indica V800R017C10SPH229 o posterior", "psirt"),
}

// ── Troubleshooting ─────────────────────────────────────────────────────────

/** One step of a fault case: what to do (messages olt.trouble.cases.<case>.steps.<id>) and, when there is one, the command. */
export type TroubleStep = { id: string; cmd?: string; src: string }
export type TroubleCase = { id: "offline" | "notRegistered" | "manyDown" | "lowPower"; steps: TroubleStep[] }
const OPTICAL = "interface gpon 0/<slot>\n display ont optical-info <puerto> <ont-id>\n quit"
export const TROUBLE: TroubleCase[] = [
  {
    id: "offline",
    steps: [
      { id: "info", cmd: "display ont info 0 <slot> <puerto> <ont-id>", src: "iatecOnu" },
      { id: "cause", src: "iatecOnu" },
      { id: "optical", cmd: OPTICAL, src: "iatecOnu" },
      { id: "history", cmd: "interface gpon 0/<slot>\n display ont register-info <puerto> <ont-id>\n quit", src: "iatecOnu" },
      { id: "alarms", cmd: "display alarm active all", src: "huaweiTs" },
    ],
  },
  {
    id: "notRegistered",
    steps: [
      { id: "autofind", cmd: "display ont autofind all", src: "iatecOnu" },
      { id: "auth", src: "tlOnu" },
      { id: "range", cmd: "interface gpon 0/<slot>\n display port info <puerto>\n quit", src: "tlOnu" },
      { id: "state", src: "iatecOnu" },
    ],
  },
  {
    id: "manyDown",
    steps: [
      { id: "summary", cmd: "display ont info summary 0/<slot>/<puerto>", src: "iatecOnu" },
      { id: "pattern", src: "iatecOnu" },
      { id: "port", cmd: "display port state all", src: "iatecOnu" },
      { id: "board", cmd: "display board 0", src: "iatecOnu" },
      { id: "rogue", src: "huaweiTs" },
    ],
  },
  {
    id: "lowPower",
    steps: [
      { id: "read", cmd: OPTICAL, src: "iatecOnu" },
      { id: "levels", src: "iatecOnu" },
      { id: "overload", src: "tlOnu" },
      { id: "clean", src: "tlOnu" },
    ],
  },
]
/** "Last down cause" values and the Huawei alarm id where the source gives one. */
export const DOWN_CAUSES: { key: string; label: string; alarm?: Fact; src: string }[] = [
  { key: "dyingGasp", label: "dying-gasp", src: "iatecOnu" },
  { key: "losi", label: "LOSi / LOBi", alarm: h("0x2e112007", "huaweiTs"), src: "iatecOnu" },
  { key: "lofi", label: "LOFi", alarm: h("0x2e112006", "huaweiTs"), src: "iatecOnu" },
  { key: "sfi", label: "SFi", alarm: h("0x2e112004", "huaweiTs"), src: "iatecOnu" },
  { key: "sdi", label: "SDi", alarm: h("0x2e112003", "huaweiTs"), src: "iatecOnu" },
  { key: "loami", label: "LOAMi", src: "iatecOnu" },
  { key: "admin", label: "deactive, ontdeleted, reset, cmdReboot", src: "iatecOnu" },
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

// ── Power: AC boards and external −48 V systems ─────────────────────────────

/** Power boards that take AC directly (rectifier inside): rated DC output, W. Every other power board needs −48 V DC from outside. */
export const AC_BOARDS: Record<string, Fact<number>> = {
  H801MPWD: h(400),
  H901PISB: h(600, "hd5800"),
}

/** Chassis maximum input current per the Huawei documents (DC), A. */
export const CHASSIS_INPUT_A: Record<string, Fact<number>> = {
  ma5608t: h(10),
  ma5603t: h(20),
  "ma5800-x2": d8(20),
  "ma5800-x7": d8(40),
  "ma5800-x15": d8(60),
  "ma5800-x17": d8(60),
}

/**
 * An AC → −48 V DC power system (rectifier shelf with batteries) for the OLTs that only take DC.
 * moduleA: what one rectifier gives at 176 V AC and up (220 V between two phases in Mexico) and, derated, at 85–175 V
 * (127 V phase to neutral).
 */
export type PowerSystem = {
  id: string
  /** Rectifier model(s) it takes. */
  rectifier: Fact
  /** low: derated figure (the source's watts at 85–175 V ÷ 53.5 V, or half where the source says it halves). */
  moduleA: { high: Fact<number>; low: Fact<number> }
  /** Rectifier slots. */
  slots: Fact<number>
  maxA: Fact<number>
  input: Fact
  /** DC outputs (breakers) to the loads. */
  outputs: Fact
  /** Biggest load output, A. */
  maxOutputA: Fact<number>
  /** Battery connection (breaker / port). */
  battery: Fact
  hasBattery: boolean
  monitor?: Fact
  size?: Fact
  temperature?: Fact
  /** Which OLTs the source says it powers. */
  powers: Fact
}
export const POWER_SYSTEMS: PowerSystem[] = [
  {
    id: "ETP4890-A2",
    rectifier: h("2 a 3 × R4830G1 / R4830N2 (30 A, 1600 W) o R4815G1 / R4815N1 (15 A)", "etp4890"),
    moduleA: { high: h(30, "etp4890"), low: h(15, "etp4890") },
    slots: h(3, "etp4890"),
    maxA: h(90, "etp4890"),
    input: h("85–300 V AC (nominal 220–240 V): monofásica 220 V, 110 V entre dos fases o trifásica; −53.5 V de salida, 4800 W máx.", "etp4890"),
    outputs: h("LOAD1 10 A, LOAD2 30 A, LOAD3 40 A, LOAD4 40 A", "etp4890"),
    maxOutputA: h(40, "etp4890"),
    battery: h("Breaker BATT de 80 A, gestión de baterías desde la SMU", "etp4890"),
    hasBattery: true,
    monitor: h("SMU01A: web, SNMP y HTTPS; SMU01B: protocolo de Huawei para equipos de acceso (U2000); contactos secos opcionales", "etp4890"),
    size: h("2U: 86.1 × 442 × 255 mm, 10 kg con 3 rectificadores; orejas para rack de 19 pulgadas o ETSI", "etp4890"),
    temperature: h("−40 a +65 °C", "etp4890"),
    powers: h("Huawei la usa en los gabinetes de AC del MA5800", "hd5800"),
  },
  {
    id: "ETP48100-A1",
    rectifier: r("1 o 2 × R4850G2 (50 A)", "tlEtp48100"),
    moduleA: { high: r(50, "tlEtp48100"), low: r(23, "tlEtp48100") },
    slots: r(2, "tlEtp48100"),
    maxA: r(100, "tlEtp48100"),
    input: r("176–290 V AC monofásica (3000 W por rectificador); de 85 a 175 V baja a 1250 W", "tlEtp48100"),
    outputs: r("2 salidas de 25 A", "tlEtp48100"),
    maxOutputA: r(25, "tlEtp48100"),
    battery: r("Sin puerto de batería", "tlEtp48100"),
    hasBattery: false,
    powers: r("MA5683T, MA5680T, MA5800-X7, X15 y X17", "tlEtp48100"),
  },
  {
    id: "EPS30-4815AF",
    rectifier: r("1 × GERM4815T (15 A)", "tlEps30"),
    moduleA: { high: r(15, "tlEps30"), low: r(7.5, "tlEps30") },
    slots: r(1, "tlEps30"),
    maxA: r(15, "tlEps30"),
    input: r("176–290 V AC monofásica (15 A, 800 W); 110 V entre dos fases: 7.5 A", "tlEps30"),
    outputs: r("Load1 10 A, Load2 20 A", "tlEps30"),
    maxOutputA: r(20, "tlEps30"),
    battery: r("Puerto BATT de 20 A", "tlEps30"),
    hasBattery: true,
    powers: r("MA5683T, MA5680T", "tlEps30"),
  },
  {
    id: "EPS75-4815AF",
    rectifier: r("3 a 5 × GERM4815T (15 A); 3 de fábrica = 45 A", "tlEps75"),
    moduleA: { high: r(15, "tlEps75"), low: h(7.5) },
    slots: r(5, "tlEps75"),
    maxA: r(75, "tlEps75"),
    input: h("Con 110 V la salida baja a la mitad (máx. 1600 W); entre 90 y 175 V AC baja en línea recta", "hd5600"),
    outputs: h("Solo dos entradas de 40 A para las OLT (una tarjeta de energía por subrack si alimenta dos)", "hd5600"),
    maxOutputA: h(40),
    battery: r("Con puerto de batería (capacidad no publicada)", "tlEps75"),
    hasBattery: true,
    powers: h("Huawei la usa en el gabinete de AC N66E-18 para MA5600T y MA5603T (hasta 100 Ah de batería)", "hd5600"),
  },
]
