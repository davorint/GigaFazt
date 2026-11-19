/**
 * Buying options found on the web (owner, 2026-11-18: "options that we have when we want to buy new stuff… search the
 * web"). Each one is a public listing in a Mexican store as it showed on WEB_SEEN, never a quote: the Compras pages
 * show them as "precio visto en la web el …, verificar" and only copy one into the team's data when someone presses
 * "Agregar". Prices are MXN as listed; `ivaNote` says when the store shows them without IVA or doesn't say. Prices per
 * meter or per piece come from the pack price (written in `notes`). Signal Fire first for the splicer and FiberHome
 * first for fiber cable (owner's preferred brands). Searched and not found with a reliable Mexican price: SC/APC patch
 * cords and the EG8145B7-50 ONT.
 */
import type { Role } from "../materials/catalog"
import type { ToolCategory } from "../tools/model"

export const WEB_SEEN = "2026-11-18"

export type WebOffer = {
  store: string
  /** MXN as listed (per the item's unit for materials). */
  price: number
  url: string
  notes: string
  /** The listing doesn't include IVA, or doesn't say. */
  ivaNote?: "sin-iva" | "no-dice"
}

export type WebTool = {
  /** Fixed id, so adding the same suggestion twice is noticed. */
  key: string
  /** What it's for: the same name as the tool in Herramientas' starter list. */
  need: string
  category: ToolCategory
  brand: string
  model: string
  specs: string
  offers: WebOffer[]
}

export type WebMaterial = {
  key: string
  /** The master-list item it's an offer for (by its role in a design). */
  role: Role
  brand: string
  product: string
  offer: WebOffer
}

export const WEB_TOOLS: WebTool[] = [
  // ── Fusionadora (Signal Fire first) ──
  {
    key: "web-sf-ai9",
    need: "Fusionadora de fibra óptica",
    category: "empalme",
    brand: "Signal Fire",
    model: "AI-9",
    specs: "Empalme en ~5 s y calentamiento en ~15 s según la publicación; incluye kit FTTH.",
    offers: [
      { store: "Amazon México", price: 18699, url: "https://www.amazon.com.mx/Signal-Fire-Ai-9-Empalmador-calefacci%C3%B3n/dp/B087ZVFN38", notes: "" },
      { store: "Mercado Libre", price: 21500, url: "https://listado.mercadolibre.com.mx/signal-fire-ai-9", notes: "Listado con varios vendedores; precios de $18,999 a $25,000." },
    ],
  },
  {
    key: "web-sf-ai20",
    need: "Fusionadora de fibra óptica",
    category: "empalme",
    brand: "Signal Fire",
    model: "AI-20",
    specs: "Cortadora de un solo paso integrada, con VFL y medidor de potencia (OPM).",
    offers: [{ store: "Amazon México", price: 20199.04, url: "https://www.amazon.com.mx/Signal-Fire-Ai-20-Fusion-Splicer/dp/B0CW2HGVT2", notes: "" }],
  },
  {
    key: "web-sf-ai8c",
    need: "Fusionadora de fibra óptica",
    category: "empalme",
    brand: "Signal Fire",
    model: "AI-8C",
    specs: "Monomodo y multimodo, pantalla de 5\", calentamiento de 6 s, kit de cuchilla.",
    offers: [{ store: "Amazon México", price: 15476.94, url: "https://www.amazon.com.mx/SignalFire-Empalmadora-fibra-%C3%B3ptica-visualizaci%C3%B3n/dp/B09ZY3MQQN", notes: "" }],
  },
  {
    key: "web-sf-ai5a",
    need: "Fusionadora de fibra óptica",
    category: "empalme",
    brand: "Signal Fire",
    model: "AI-5A",
    specs: "4 motores (alineación por revestimiento), la más económica de la marca.",
    offers: [{ store: "Amazon México", price: 9500, url: "https://www.amazon.com.mx/Fusionadora-motores-M%C3%A1quina-empalme-integrada/dp/B0DRCJQ543", notes: "" }],
  },
  // ── Cortadora de precisión ──
  {
    key: "web-tempo-920cl",
    need: "Cortadora de precisión (cleaver)",
    category: "empalme",
    brand: "TEMPO",
    model: "920CL",
    specs: "Cleaver de campo de marca reconocida.",
    offers: [{ store: "Mi Com", price: 6384.64, url: "https://micom.mx/producto/cleaver-cortadora-de-precision-tempo-para-fibra-optica-920cl-238145", notes: "IVA incluido según la tienda." }],
  },
  {
    key: "web-tempo-fcl100",
    need: "Cortadora de precisión (cleaver)",
    category: "empalme",
    brand: "TEMPO",
    model: "FCL100",
    specs: "Cleaver de campo.",
    offers: [{ store: "Sears México", price: 5803, url: "https://www.sears.com.mx/producto/3742960", notes: "Precio de oferta; normal $7,708." }],
  },
  {
    key: "web-cleaver-s09",
    need: "Cortadora de precisión (cleaver)",
    category: "empalme",
    brand: "",
    model: "S09",
    specs: "Cuchilla de tungsteno de 16 facetas, ángulo de corte promedio ≤0.5°.",
    offers: [{ store: "Amazon México", price: 2722.86, url: "https://www.amazon.com.mx/cortador-precisi%C3%B3n-tungsteno-herramienta-telecomunicaciones/dp/B0H4M9W58X", notes: "" }],
  },
  {
    key: "web-linkedpro-fcx6",
    need: "Cortadora de precisión (cleaver)",
    category: "empalme",
    brand: "LinkedPro",
    model: "LP-FC-X6",
    specs: "3 pasos, hasta 48,000 cortes, monomodo y multimodo.",
    offers: [{ store: "SATBYTE", price: 274, url: "https://www.satbyte.mx/cableado-estructurado/fibra-optica/herramientas-fibra-optica/lp-fc-x6-linkedpro-by-epcom/", notes: "IVA incluido según la tienda. Precio muy bajo para un cleaver: confirmar." }],
  },
  // ── OTDR ──
  {
    key: "web-otdr-2422",
    need: "OTDR",
    category: "medicion",
    brand: "",
    model: "Mini OTDR 1310/1550 nm 24/22 dB",
    specs: "Pantalla táctil, alcance 70 km.",
    offers: [{ store: "Mercado Libre", price: 6087, url: "https://www.mercadolibre.com.mx/mini-otdr-1310-1550nm-2422-db-con-pantalla-tactil-70km/p/MLM38053122", notes: "Revisar si envía desde China, tiempo de entrega y garantía." }],
  },
  {
    key: "web-otdr-bsai",
    need: "OTDR",
    category: "medicion",
    brand: "",
    model: "Mini OTDR monomodo 1310/1550 nm",
    specs: "Con VFL de 10 mW, medidor de potencia y mapeo de cable RJ45; hasta 64 km.",
    offers: [{ store: "BSAI", price: 6187.6, url: "https://bsai.com.mx/products/mini-otdr-para-fibra-optica-monomodo-longitud-de-onda-1310nm-y-1550nm-funcion-vfl-10mw-funcion-opm-mapeo-de-cables-de-red-rj45-recargable-distancia-de-prueba-hasta-64-km", notes: "Tienda en México." }],
  },
  // ── Medidor de potencia PON ──
  {
    key: "web-pon-komshine",
    need: "Medidor de potencia PON (1310/1490/1550)",
    category: "medicion",
    brand: "Komshine",
    model: "Medidor PON con adaptador SC/APC",
    specs: "1310/1490/1550 nm, mide en línea (modo ráfaga en 1310 nm).",
    offers: [{ store: "Amazon México", price: 1717.03, url: "https://www.amazon.com.mx/Komshine-potencia-herramienta-detector-adaptador/dp/B09CT5NZ8K", notes: "" }],
  },
  {
    key: "web-pon-kpn35",
    need: "Medidor de potencia PON (1310/1490/1550)",
    category: "medicion",
    brand: "Komshine",
    model: "KPN-35",
    specs: "1310/1490/1550 nm, resolución 0.1 dB.",
    offers: [{ store: "Amazon México", price: 3216.21, url: "https://www.amazon.com.mx/medidor-potencia-KOMSHINE-Optical-Resolution/dp/B0GH75ZJDG", notes: "" }],
  },
  {
    key: "web-pon-grandway",
    need: "Medidor de potencia PON (1310/1490/1550)",
    category: "medicion",
    brand: "Grandway",
    model: "FHP2P01",
    specs: "1310/1490/1550 nm para EPON/GPON.",
    offers: [{ store: "Amazon México", price: 3879, url: "https://www.amazon.com.mx/Grandway-FHP2P01-Medidor-potencia-%C3%B3ptica/dp/B081NKQRV5", notes: "" }],
  },
  {
    key: "web-pon-speedwolf",
    need: "Medidor de potencia PON (1310/1490/1550)",
    category: "medicion",
    brand: "SPEEDWOLF",
    model: "PON + VFL",
    specs: "Medidor PON 1310/1490/1550 nm más medidor de 850–1625 nm y VFL.",
    offers: [{ store: "Amazon México", price: 5951.29, url: "https://www.amazon.com.mx/SPEEDWOLF-Medidor-potencia-medidor-pruebas/dp/B0B5FBNWWB", notes: "" }],
  },
  // ── VFL ──
  {
    key: "web-vfl-30-fclc",
    need: "Localizador visual de fallas (VFL)",
    category: "medicion",
    brand: "",
    model: "VFL 30 mW, 30 km",
    specs: "Incluye adaptador FC macho a LC hembra.",
    offers: [{ store: "Amazon México", price: 575.5, url: "https://www.amazon.com.mx/Localizador-incluye-bol%C3%ADgrafo-medidor-detector/dp/B0CFHDSLKD", notes: "" }],
  },
  {
    key: "web-vfl-30-univ",
    need: "Localizador visual de fallas (VFL)",
    category: "medicion",
    brand: "",
    model: "VFL 30 mW, 30 km, cuerpo de aluminio",
    specs: "Adaptador para LC/FC/SC/ST.",
    offers: [{ store: "Amazon México", price: 830.07, url: "https://www.amazon.com.mx/Localizador-bol%C3%ADgrafo-adaptador-universal-conectores/dp/B08BJRCR79", notes: "" }],
  },
  // ── Peladoras y tijera ──
  {
    key: "web-miller-kit",
    need: "Peladora de fibra de 3 orificios",
    category: "corte",
    brand: "Miller",
    model: "MA01-7001 (CFS-3 + tijera KS-1)",
    specs: "Peladora CFS-3 de 3 orificios y tijera para kevlar KS-1, con bolsa para cinturón.",
    offers: [{ store: "Amazon México", price: 1571.97, url: "https://www.amazon.com.mx/Miller-CFS-3-herramienta-KS-1-herramientas/dp/B07H37QTQM", notes: "Cubre también la tijera para kevlar." }],
  },
  {
    key: "web-cfs3-kit",
    need: "Peladora de fibra de 3 orificios",
    category: "corte",
    brand: "",
    model: "Kit CFS-3 + peladora drop + tijera kevlar (3 en 1)",
    specs: "Peladora de 3 orificios, peladora de cable drop y tijera de aramida.",
    offers: [{ store: "Amazon México", price: 909.79, url: "https://www.amazon.com.mx/herramientas-pelacables-inoxidable-orificios-especiales/dp/B09KRHWNDG", notes: "Genérico; cubre también la peladora drop y la tijera." }],
  },
  {
    key: "web-miller-ks2",
    need: "Tijeras para kevlar",
    category: "corte",
    brand: "Miller",
    model: "KS-2",
    specs: "Tijera para kevlar de 6\".",
    offers: [{ store: "Fibramarket", price: 299, url: "https://www.fibramarket.com/p/ks2-tijeras-para-kevlar-6/", notes: "La tienda lo muestra + IVA.", ivaNote: "sin-iva" }],
  },
]

export const WEB_MATERIALS: WebMaterial[] = [
  // ── Cable drop (FiberHome first) ──
  {
    key: "web-drop-linkedpro",
    role: "drop-m",
    brand: "LinkedPro by FiberHome",
    product: "IC-DROPA2-1C · drop G.657A2, 1 hilo, LSZH, bobina de 1 km",
    offer: { store: "RadioMex", price: 3.1, url: "https://www.radiomex.mx/ic-dropa2-1c/", notes: "Bobina de 1 km a $3,104.46 con IVA (distribuidor oficial); precio por metro calculado." },
  },
  {
    key: "web-drop-fh-amazon",
    role: "drop-m",
    brand: "FiberHome",
    product: "Drop mini figura 8, G.657A2, 1 hilo, negro, carrete de 1 km",
    offer: { store: "Amazon México", price: 3.34, url: "https://www.amazon.com.mx/FIBERHOME-Carrete-G-657A2-Monomodo-unifibra/dp/B0BT8CH7L1", notes: "Carrete de 1 km a $3,344; precio por metro calculado." },
  },
  {
    key: "web-drop-fh-ml",
    role: "drop-m",
    brand: "FiberHome",
    product: "Drop interior/exterior monomodo 1 hilo, bobina de 1 km",
    offer: { store: "Mercado Libre", price: 1.85, url: "https://listado.mercadolibre.com.mx/fiberhome", notes: "Bobina de 1 km a $1,850 en un listado; precio por metro calculado. Confirmar vendedor y vigencia." },
  },
  // ── Splitters PLC ──
  {
    key: "web-plc8-tempo",
    role: "splitter-8",
    brand: "TEMPO",
    product: "TM-PLC-1X8APC · PLC 1x8 SC/APC",
    offer: { store: "SATBYTE", price: 422, url: "https://www.satbyte.mx/redes-e-it/redes-ftth-pon/splitters-y-cajas-de-empalme/tm-plc-1x8apc-tempo/", notes: "IVA incluido; envío $99." },
  },
  {
    key: "web-plc8-sily",
    role: "splitter-8",
    brand: "TEMPO",
    product: "TM-PLC-1X8APC · PLC 1x8 SC/APC",
    offer: { store: "Sily", price: 404, url: "https://sily.mx/products/splitter-divisor-optico-tipo-plc-1x8-conectores-sc-apc", notes: "IVA incluido." },
  },
  {
    key: "web-plc16-fh",
    role: "splitter-16",
    brand: "FiberHome",
    product: "PLC-116-SCAPC · PLC 1x16 SC/APC",
    offer: { store: "Compustar", price: 339, url: "https://www.compustar.mx/producto/PLC-116-SCAPC/", notes: "IVA incluido; con existencias al buscar." },
  },
  {
    key: "web-plc16-tempo",
    role: "splitter-16",
    brand: "TEMPO",
    product: "TM-PLC-1X16APC · PLC 1x16 SC/APC",
    offer: { store: "SATBYTE", price: 638, url: "https://www.satbyte.mx/redes-e-it/redes-ftth-pon/splitters-y-cajas-de-empalme/tm-plc-1x16apc-tempo/", notes: "IVA incluido." },
  },
  // ── Conectores rápidos del cliente ──
  {
    key: "web-fastsc-amazon",
    role: "client-connector",
    brand: "",
    product: "Conector rápido SC/APC, paquete de 100",
    offer: { store: "Amazon México", price: 7.19, url: "https://www.amazon.com.mx/Conector-r%C3%A1pido-adaptador-conexi%C3%B3n-integrada/dp/B0D95MT3V6", notes: "Paquete de 100 a $719; precio por pieza calculado. Quedaban pocas piezas." },
  },
  {
    key: "web-fastsc-sanborns",
    role: "client-connector",
    brand: "",
    product: "Conector rápido SC/APC para FTTH, paquete de 100",
    offer: { store: "Sanborns", price: 12.79, url: "https://www.sanborns.com.mx/producto/420826/conector-rapido-de-fibra-optica-sc-apc-para-ftth-100pzs", notes: "Paquete de 100 a $1,279 (oferta); precio por pieza calculado." },
  },
  // ── Caja de piso (NAP) ──
  {
    key: "web-nap16-linkedpro",
    role: "floor-box",
    brand: "LinkedPro",
    product: "LP-FAT16DB · 16 acopladores SC/APC con splitter 1x16, IP68",
    offer: { store: "BSAI", price: 1151, url: "https://bsai.com.mx/products/caja-de-distribucion-de-fibra-optica-para-24-empalmes-con-16-acopladores-sc-apc-enterrado-directo-ip68-splitter-1x16-incluido-con-conectores-sc-apc", notes: "IVA incluido; ya trae el splitter 1x16." },
  },
  {
    key: "web-nap16-fh-ml",
    role: "floor-box",
    brand: "FiberHome",
    product: "Caja NAP 1x16 SC/APC",
    offer: { store: "Mercado Libre", price: 1118, url: "https://listado.mercadolibre.com.mx/cajas-naps", notes: "Listado; otra variante del mismo modelo en $852.15. Confirmar si trae splitter." },
  },
  // ── Manguitos de empalme ──
  {
    key: "web-sleeve-amazon",
    role: "splice",
    brand: "shenruifa",
    product: "Manguito termocontráctil 60 mm, paquete de 100",
    offer: { store: "Amazon México", price: 1.19, url: "https://www.amazon.com.mx/shenruifa-Termorretr%C3%A1ctiles-%C3%B3ptica-Manguitos-Empalme/dp/B0DSPYH72J", notes: "Paquete de 100 a $119; precio por pieza calculado." },
  },
  {
    key: "web-sleeve-ml",
    role: "splice",
    brand: "",
    product: "Manguito termocontráctil 60 x 2.5 mm con refuerzo, 100 piezas",
    offer: { store: "Mercado Libre", price: 6.85, url: "https://articulo.mercadolibre.com.mx/MLM-665922800-manga-termocontractil-para-empalme-de-fibra-60-mm-100-pzas-_JM", notes: "Paquete de 100 a $685 (distribuidor en CDMX); precio por pieza calculado." },
  },
]
