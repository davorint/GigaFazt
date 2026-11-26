"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import interno from "@/messages/internal/interno.es.json"
import { LOGIN_PATH } from "@/lib/internal-pages"
import { fetchMe } from "@/lib/team/me-client"
import { areaAllowed, pageAllowed, type Area } from "@/lib/team/roles"

/**
 * When an internal page opens, asks the server whether this session still counts (owner review 2026-11-20): the proxy
 * only checks the cookie's signature, but a deactivated account, a session signed in before a password reset, or the
 * shared password once team accounts exist are refused by the data routes (lib/internal-api whoIs). Then the page goes
 * to the sign-in instead of showing what this phone has stored. Without signal it does nothing: the tools keep working
 * offline. A database that's down never signs anyone out (whoIs lets the session through).
 *
 * Phase 14 (roles): a page the person's role doesn't reach is covered by "Sin acceso", and the links to such pages
 * (marked data-nav: the menu, the hubs) are hidden. The server refuses their data either way (lib/team/roles.ts).
 */
const copy = interno.interno

export function SessionGuard() {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (window.location.pathname.startsWith(LOGIN_PATH) || !navigator.onLine) return
    let alive = true
    fetchMe()
      .then((r) => {
        if (!alive) return
        if (r.status === 401) {
          const next = window.location.pathname.replace(/^\/[a-z]{2}(?=\/interno)/, "")
          window.location.replace(`${LOGIN_PATH}?error=ended&next=${encodeURIComponent(next)}`)
          return
        }
        const access = r.access
        if (!access || !alive) return
        setBlocked(!pageAllowed(access, window.location.pathname))
        for (const a of document.querySelectorAll<HTMLAnchorElement>("a[data-nav]")) {
          if (!pageAllowed(access, a.pathname)) (a.closest("li") ?? a).setAttribute("hidden", "")
        }
        // Buttons for something the role can't do (the full backup, the files zip): hidden, not a refusal later.
        for (const el of document.querySelectorAll<HTMLElement>("[data-area]")) {
          if (!areaAllowed(access, el.dataset.area as Area)) el.setAttribute("hidden", "")
        }
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  if (!blocked) return null
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="sin-acceso" className="fixed inset-0 z-50 grid place-items-center bg-zinc-950 p-6">
      <div className="grid max-w-sm gap-3 text-center">
        <h2 id="sin-acceso" className="text-xl font-light text-foreground">
          {copy.noAccess.title}
        </h2>
        <p className="text-sm text-zinc-300">{copy.noAccess.body}</p>
        <Link href="/interno" className="mx-auto inline-flex min-h-10 items-center rounded-full bg-white px-4 text-sm font-medium text-zinc-950 hover:bg-zinc-200">
          {copy.noAccess.home}
        </Link>
      </div>
    </div>
  )
}
