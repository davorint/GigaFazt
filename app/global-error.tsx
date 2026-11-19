"use client"

import { sendClientError } from "@/lib/errors/client"
import { useEffect, useSyncExternalStore } from "react"
import "./globals.css"
import { ERROR_PRIMARY, ERROR_SECONDARY, ErrorScreen } from "@/components/layout/ErrorScreen"
// Only the error copy (a copy of errorPage in es.json/en.json, kept equal by lib/i18n-client.test.ts): this file is in
// every page's bundle, the full message files are not.
import copy from "@/messages/global-error.json"

const noop = () => () => {}
const isEnglishUrl = () => /^\/en(\/|$)/.test(window.location.pathname)

/**
 * The root layout itself failed: this replaces the whole document, without the site's messages or fonts. The language
 * comes from the URL (/en/… → English, anything else Spanish; Spanish on the server, so hydration matches).
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const en = useSyncExternalStore(noop, isEnglishUrl, () => false)
  const t = en ? copy.en : copy.es
  useEffect(() => {
    console.error(error)
    sendClientError(error)
  }, [error])
  return (
    <html lang={en ? "en" : "es-MX"} className="dark h-full antialiased">
      <body className="min-h-full bg-background text-foreground">
        <title>{`${t.title} | GigaFazt`}</title>
        <main>
          <ErrorScreen
            code={t.code}
            title={t.title}
            lead={t.lead}
            extra={error.digest ? <p className="font-mono text-xs text-zinc-400">{t.ref.replace("{digest}", error.digest)}</p> : null}
          >
            <button type="button" onClick={() => retry()} className={ERROR_PRIMARY}>
              {t.retry}
            </button>
            <a href={en ? "/en" : "/es"} className={ERROR_SECONDARY}>
              {t.home}
            </a>
          </ErrorScreen>
        </main>
      </body>
    </html>
  )
}
