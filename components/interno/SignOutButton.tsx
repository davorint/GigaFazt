"use client"

/**
 * "Salir": signs out, and first removes the pages this phone keeps for working without signal (public/sw-interno.js),
 * so nobody opens them here afterwards. The records saved on the phone stay (unsent edits must not be lost); "Salir y
 * borrar los datos de este teléfono" removes those too.
 */
export function SignOutButton({ label }: { label: string }) {
  return (
    <form
      action="/api/interno/salir"
      method="post"
      onSubmit={async (e) => {
        if (!("caches" in window)) return
        e.preventDefault()
        const form = e.currentTarget
        try {
          for (const k of await caches.keys()) if (k.startsWith("interno-pages")) await caches.delete(k)
        } catch {
          // Storage blocked: nothing kept to remove.
        }
        form.submit()
      }}
    >
      <button type="submit" className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/5 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {label}
      </button>
    </form>
  )
}
