import type { Metadata } from "next"
import Link from "next/link"
import { Geist, JetBrains_Mono } from "next/font/google"
import "./globals.css"
import { ERROR_PRIMARY, ERROR_SECONDARY, ErrorScreen } from "@/components/layout/ErrorScreen"
import { company } from "@/lib/company"
import { whatsappHref } from "@/lib/contact"
import { isPlaceholder } from "@/lib/placeholder"
import es from "@/messages/es.json"
import en from "@/messages/en.json"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: `${es.notFound.meta} · ${en.notFound.meta} | GigaFazt`,
}

/**
 * A URL that matches no route (/es/nope, /nope): the root layout is the [locale] one, so this page brings its own
 * document. The language isn't known here, so it's Spanish first with the English line below; Next sends it with a
 * 404 status and noindex.
 */
export default function GlobalNotFound() {
  const t = es.notFound
  return (
    <html lang="es-MX" className={`${geistSans.variable} ${jetbrainsMono.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <main>
          <ErrorScreen
            code={t.code}
            title={t.title}
            lead={t.lead}
            extra={
              <div lang="en" className="mt-6 grid gap-3 border-t border-border pt-6">
                <p className="text-sm text-zinc-300">
                  <span className="font-medium text-foreground">{en.notFound.title}.</span> {en.notFound.lead}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Link href="/en" className={ERROR_SECONDARY}>
                    {en.notFound.home}
                  </Link>
                  <Link href="/en/planes" className={ERROR_SECONDARY}>
                    {en.notFound.plans}
                  </Link>
                </div>
              </div>
            }
          >
            <Link href="/es" className={ERROR_PRIMARY}>
              {t.home}
            </Link>
            <Link href="/es/planes" className={ERROR_SECONDARY}>
              {t.plans}
            </Link>
            <Link href="/es/clientes" className={ERROR_SECONDARY}>
              {t.clients}
            </Link>
            {!isPlaceholder(company.whatsapp) && (
              <a href={whatsappHref(company.whatsapp, t.whatsappText)} target="_blank" rel="noopener noreferrer" className={ERROR_SECONDARY}>
                {t.whatsapp}
              </a>
            )}
          </ErrorScreen>
        </main>
      </body>
    </html>
  )
}
