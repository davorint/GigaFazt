/** WhatsApp deep link (wa.me) with an optional prefilled message. */
export function whatsappHref(number: string, text?: string): string {
  const digits = number.replace(/\D/g, "")
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`
}

/** tel: link keeping only digits and a leading +. */
export function telHref(phone: string): string {
  const trimmed = phone.trim()
  const digits = trimmed.replace(/\D/g, "")
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`
}
