/** Sends a page crash to POST /api/errores (lib/errors/server.ts); never throws, never retries. */
export function sendClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: String(error?.message ?? error).slice(0, 500), digest: error?.digest, path: window.location.pathname })
    if (navigator.sendBeacon?.(new URL("/api/errores", window.location.origin), new Blob([body], { type: "application/json" }))) return
    void fetch("/api/errores", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined)
  } catch {
    // Reporting must never break the error screen.
  }
}
