/*
 * Offline for the internal tools (owner, 2026-11-19): /interno pages open without signal once they were opened on this
 * phone. Their data already lives in the phone (localStorage) and syncs when the signal comes back (lib/sync); this
 * only keeps the pages themselves.
 *
 * - Pages under /interno: from the network first; each one that loads is saved (by path, without ?query) and shown
 *   from here when there is no signal. Redirects (signed out → /interno/entrar) and errors are never saved.
 * - The app's own files (/_next/static, immutable): from here first, saved the first time.
 * - /api (sync, sign-in, backups) and other sites: never touched.
 * "Salir y borrar los datos de este teléfono" removes all of it (Clear-Site-Data).
 */
const PAGES = "interno-pages-v1"
const STATIC = "interno-static-v1"
const KEEP = [PAGES, STATIC]
/** Files kept from the app's builds: each deploy adds new ones, so the oldest go once there are more than this. */
const MAX_STATIC = 500

async function trim() {
  const c = await caches.open(STATIC)
  const keys = await c.keys()
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_STATIC))) await c.delete(k)
}

self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (!KEEP.includes(k)) await caches.delete(k)
      await self.clients.claim()
    })()
  )
})

const OFFLINE = `<!doctype html><html lang="es-MX"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión | GigaFazt</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#05070a;color:#e4e4e7;font:16px system-ui,sans-serif;padding:24px"><main style="max-width:28rem"><h1 style="font-size:1.25rem">Sin conexión</h1><p>Esta página no se ha abierto antes en este teléfono, así que no está guardada. Ábrela una vez con señal y después funcionará sin ella.</p><p><a href="/interno" style="color:#67e8f9">Ir al inicio de /interno</a></p></main></body></html>`

const isPage = (url, req) => req.mode === "navigate" && /^\/(?:[a-z]{2}\/)?interno(?:\/|$)/i.test(url.pathname)

self.addEventListener("fetch", (e) => {
  const req = e.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return

  if (isPage(url, req)) {
    e.respondWith(
      (async () => {
        const key = url.origin + url.pathname
        try {
          const res = await fetch(req)
          if (res.ok && !res.redirected && res.type === "basic") (await caches.open(PAGES)).put(key, res.clone())
          return res
        } catch {
          return (await caches.match(key, { cacheName: PAGES })) || new Response(OFFLINE, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } })
        }
      })()
    )
    return
  }

  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(
      (async () => {
        const hit = await caches.match(req, { cacheName: STATIC })
        if (hit) return hit
        const res = await fetch(req)
        if (res.ok) {
          await (await caches.open(STATIC)).put(req, res.clone())
          e.waitUntil(trim())
        }
        return res
      })()
    )
  }
})
