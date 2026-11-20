"use client"

import { useEffect } from "react"
import { LOGIN_PATH } from "@/lib/internal-pages"

/**
 * When an internal page opens, asks the server whether this session still counts (owner review 2026-11-20): the proxy
 * only checks the cookie's signature, but a deactivated account, a session signed in before a password reset, or the
 * shared password once team accounts exist are refused by the data routes (lib/internal-api whoIs). Then the page goes
 * to the sign-in instead of showing what this phone has stored. Without signal it does nothing: the tools keep working
 * offline. A database that's down never signs anyone out (whoIs lets the session through).
 */
export function SessionGuard() {
  useEffect(() => {
    if (window.location.pathname.startsWith(LOGIN_PATH) || !navigator.onLine) return
    let alive = true
    fetch("/api/interno/yo", { cache: "no-store" })
      .then((r) => {
        if (!alive || r.status !== 401) return
        const next = window.location.pathname.replace(/^\/[a-z]{2}(?=\/interno)/, "")
        window.location.replace(`${LOGIN_PATH}?error=ended&next=${encodeURIComponent(next)}`)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return null
}
