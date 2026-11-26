import Link from "next/link"

/**
 * A link that navigates client-side when it points to another page ("/es/…",
 * so page transitions run and nothing reloads) and stays a plain anchor for
 * same-page "#section" links (smooth scroll handles those). `href` already
 * carries the locale. No prefetching (owner, 2026-11-26): every prefetch of a page goes through proxy.ts, which runs
 * as a Vercel function, so each link in view cost one or two function calls per page view; the page is fetched on
 * click instead (one call, still a client-side navigation). The same holds for every next/link on the site.
 */
export function SmartLink({ href, ...rest }: React.ComponentProps<"a"> & { href: string }) {
  return href.startsWith("/") ? <Link prefetch={false} href={href} {...rest} /> : <a href={href} {...rest} />
}
