import Link from "next/link"

/**
 * A link that navigates client-side when it points to another page ("/es/…",
 * so page transitions run and nothing reloads) and stays a plain anchor for
 * same-page "#section" links (smooth scroll handles those). `href` already
 * carries the locale.
 */
export function SmartLink({ href, ...rest }: React.ComponentProps<"a"> & { href: string }) {
  return href.startsWith("/") ? <Link href={href} {...rest} /> : <a href={href} {...rest} />
}
