"use client"

import { sendClientError } from "@/lib/errors/client"
import { useEffect } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ERROR_PRIMARY, ERROR_SECONDARY, ErrorScreen } from "@/components/layout/ErrorScreen"

/**
 * A page that failed while rendering: try again or go home. The layout (and its messages) is still there, so the copy
 * follows the page's language. Kept small on purpose: the boundary loads with every page, so no Nav (a second copy of
 * its icons and motion added ~17 KB) and no WhatsApp button (the company data). Errors in the layout itself go to
 * app/global-error.tsx.
 */
export default function LocaleError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("errorPage")
  const locale = useLocale()
  useEffect(() => {
    console.error(error)
    sendClientError(error)
  }, [error])
  return (
    <main>
      <ErrorScreen
        code={t("code")}
        title={t("title")}
        lead={t("lead")}
        extra={error.digest ? <p className="font-mono text-xs text-zinc-400">{t("ref", { digest: error.digest })}</p> : null}
      >
        <button type="button" onClick={() => retry()} className={ERROR_PRIMARY}>
          {t("retry")}
        </button>
        <a href={`/${locale}`} className={ERROR_SECONDARY}>
          {t("home")}
        </a>
      </ErrorScreen>
    </main>
  )
}
