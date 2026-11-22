/**
 * WhatsApp notices (WispDavor → Avisos, owner 2026-11-21: "WhatsApp Cloud API", API number ready, templates "Not yet").
 *
 * A business starts a WhatsApp conversation only with a template Meta approved. These templates are written here for the
 * owner to submit in WhatsApp Manager (category Utility, language Spanish (MEX) = es_MX) with these exact names and
 * variables in this order; their text below is what we submit and what the wa.me fallback sends, so both say the same.
 * Until the keys are on the host (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID) or a template is approved, each notice is a
 * one-tap wa.me link instead (lib/wispdavor/whatsapp-server.ts sends through the API).
 */

export const TEMPLATE_IDS = ["recordatorio", "corte", "reconexion", "mantenimiento", "pagoRecibido", "cobroFallido", "reporte", "bienvenida"] as const
export type TemplateId = (typeof TEMPLATE_IDS)[number]
/** The ones staff send from Avisos; the others go by themselves (payments, report updates). */
export const MANUAL_TEMPLATES = ["recordatorio", "corte", "reconexion", "mantenimiento"] as const satisfies readonly TemplateId[]

export type Template = {
  /** The name in Meta's WhatsApp Manager. */
  name: string
  /** The variables, in order ({{1}}, {{2}}…). */
  params: readonly string[]
  /** The body as submitted to Meta, with {{n}}. */
  body: string
}

export const LANGUAGE = "es_MX"

export const TEMPLATES: Record<TemplateId, Template> = {
  recordatorio: {
    name: "gigafazt_recordatorio_pago",
    params: ["nombre", "monto", "fecha", "enlace"],
    body: "Hola {{1}}, te recordamos que tu pago de internet GigaFazt por {{2}} vence el {{3}}. Consulta tu saldo y cómo pagar aquí: {{4}}",
  },
  corte: {
    name: "gigafazt_aviso_corte",
    params: ["nombre", "monto", "fecha", "enlace"],
    body: "Hola {{1}}, tu servicio de internet GigaFazt tiene un saldo pendiente de {{2}}. Para evitar la suspensión, realiza tu pago a más tardar el {{3}}. Detalles y formas de pago: {{4}}",
  },
  reconexion: {
    name: "gigafazt_reconexion",
    params: ["nombre"],
    body: "Hola {{1}}, recibimos tu pago y tu servicio de internet GigaFazt ya está activo. Si no tienes conexión, reinicia tu módem. ¡Gracias!",
  },
  mantenimiento: {
    name: "gigafazt_mantenimiento",
    params: ["nombre", "lugar", "fecha", "detalle"],
    body: "Hola {{1}}, te avisamos que habrá mantenimiento en la red de {{2}} el {{3}}. {{4}} Gracias por tu paciencia.",
  },
  // Phase 2 (online payments): sent by themselves when a payment arrives or a card charge fails.
  pagoRecibido: {
    name: "gigafazt_pago_recibido",
    params: ["nombre", "monto", "enlace"],
    body: "Hola {{1}}, recibimos tu pago de {{2}}. ¡Gracias! Consulta tu cuenta aquí: {{3}}",
  },
  cobroFallido: {
    name: "gigafazt_cobro_fallido",
    params: ["nombre", "monto", "enlace"],
    body: "Hola {{1}}, no pudimos cobrar {{2}} a tu tarjeta. Actualízala o paga de otra forma aquí: {{3}}",
  },
  // Phase 9 (self-service): sent by itself when a client's report goes to "visita" or "resuelto".
  reporte: {
    name: "gigafazt_reporte_actualizado",
    params: ["nombre", "codigo", "estado", "enlace"],
    body: "Hola {{1}}, tu reporte {{2}} de GigaFazt ahora está: {{3}}. Consulta los detalles aquí: {{4}}",
  },
  // Phase 12 (new client in one step): sent from Alta with the installation date and their portal.
  bienvenida: {
    name: "gigafazt_bienvenida",
    params: ["nombre", "fecha", "enlace"],
    body: "Hola {{1}}, ¡bienvenido a GigaFazt! Tu instalación quedó agendada para el {{2}}. En este enlace puedes ver tu cuenta, pagar y reportar fallas: {{3}}",
  },
}

/** The message with its variables filled (preview and wa.me). */
export function fill(id: TemplateId, values: string[]): string {
  return TEMPLATES[id].body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => values[Number(n) - 1] ?? "")
}

/**
 * A Mexican number as WhatsApp takes it: 52 + 10 digits ("55 1234 5678", "+52 1 55…" → 525512345678); null when it
 * isn't 10 digits after the country code.
 */
export function waNumber(raw: string): string | null {
  let d = raw.replace(/\D/g, "")
  if (d.startsWith("521") && d.length === 13) d = d.slice(3)
  else if (d.startsWith("52") && d.length === 12) d = d.slice(2)
  return d.length === 10 ? `52${d}` : null
}

/** A variable as Meta takes it: one line, no tabs or runs of 4+ spaces, at most 200 characters (ours). */
export const cleanParam = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, 200)

export const MAX_PER_SEND = 100
