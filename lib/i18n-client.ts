/**
 * The message namespaces client components read (useTranslations in files that end up in the browser bundle). The
 * layout sends only these to the browser; the rest (privacy notice, FAQ, SEO, page heads…) are read on the server and
 * would only add weight to every page. lib/i18n-client.test.ts checks every "use client" file against this list.
 */
export const CLIENT_NAMESPACES = [
  "nav",
  "status",
  "hero",
  "common",
  "plans",
  "addons",
  "recommender",
  "lead",
  "fiber",
  "map",
  "proof",
  "cta",
  "motion",
  "states",
  "business",
  "report",
  "customer",
  "errorPage",
] as const

export function clientMessages<M extends Record<string, unknown>>(messages: M): Partial<M> {
  return Object.fromEntries(CLIENT_NAMESPACES.filter((k) => k in messages).map((k) => [k, messages[k]])) as Partial<M>
}
