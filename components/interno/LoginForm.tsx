"use client"

import { useEffect, useId, useState } from "react"

/**
 * The /interno sign-in form: a plain POST to /api/interno/entrar (works without JavaScript, then lands on /interno).
 * With JavaScript it also carries the page asked for (?next=) and shows the wrong-password message (?error=1).
 */
export function LoginForm({ labels }: { labels: { password: string; submit: string; error: string } }) {
  const id = useId()
  const [next, setNext] = useState("")
  const [error, setError] = useState(false)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    // Read once after mounting: the page is static, the query only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the URL after hydration, not a cascade
    setNext(q.get("next") ?? "")
    setError(q.get("error") === "1")
  }, [])
  return (
    <form action="/api/interno/entrar" method="post" className="mt-8 grid gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <label htmlFor={id} className="font-mono text-xs text-zinc-300">
          {labels.password}
        </label>
        <input
          id={id}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          autoFocus
          aria-invalid={error || undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 rounded-lg border border-white/15 bg-white/[0.03] px-3 text-base text-foreground outline-none focus-visible:border-white/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-red-300">
            {labels.error}
          </p>
        )}
      </div>
      <button type="submit" className="h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {labels.submit}
      </button>
    </form>
  )
}
