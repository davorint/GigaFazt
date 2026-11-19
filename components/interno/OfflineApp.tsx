"use client"

import { useEffect } from "react"

/**
 * Registers the offline worker of the internal tools (public/sw-interno.js), scoped to /interno only: the public site
 * is never served from it. Production builds only (in development it would keep stale pages).
 */
export function OfflineApp() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker.register("/sw-interno.js", { scope: "/interno" }).catch(() => undefined)
  }, [])
  return null
}
