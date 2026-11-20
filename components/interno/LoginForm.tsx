"use client"

import { useEffect, useId, useState } from "react"

/**
 * The /interno sign-in form: a plain POST to /api/interno/entrar (works without JavaScript, then lands on /interno).
 * With JavaScript it also carries the page asked for (?next=) and shows why the last try failed (?error=1 wrong
 * password, limit too many tries, config the server has no password set).
 */
type Labels = { name: string; nameHint: string; password: string; submit: string; error: string; errorLimit: string; errorConfig: string; errorAccounts: string; errorEnded: string }

export function LoginForm({ labels }: { labels: Labels }) {
  const id = useId()
  const [next, setNext] = useState("")
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const e = q.get("error")
    // Read once after mounting: the page is static, the query only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one read of the URL after hydration, not a cascade
    setNext(q.get("next") ?? "")
    setError(e === "limit" ? labels.errorLimit : e === "config" ? labels.errorConfig : e === "accounts" ? labels.errorAccounts : e === "ended" ? labels.errorEnded : e ? labels.error : null)
  }, [labels])
  return (
    <form action="/api/interno/entrar" method="post" className="mt-8 grid gap-4">
      <input type="hidden" name="next" value={next} />
      <div className="grid gap-1.5">
        <label htmlFor={`${id}-name`} className="font-mono text-xs text-zinc-300">
          {labels.name}
        </label>
        <input
          id={`${id}-name`}
          name="name"
          autoComplete="username"
          autoCapitalize="words"
          maxLength={40}
          aria-describedby={`${id}-name-hint`}
          className="h-11 rounded-lg border border-white/15 bg-white/[0.03] px-3 text-base text-foreground outline-none focus-visible:border-white/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <p id={`${id}-name-hint`} className="text-xs text-zinc-400">
          {labels.nameHint}
        </p>
      </div>
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-11 rounded-lg border border-white/15 bg-white/[0.03] px-3 text-base text-foreground outline-none focus-visible:border-white/40 focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
      <button type="submit" className="h-11 rounded-full bg-white px-5 text-sm font-medium text-zinc-950 hover:bg-zinc-200 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
        {labels.submit}
      </button>
    </form>
  )
}
