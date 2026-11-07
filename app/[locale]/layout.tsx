import type { Metadata } from "next"
import { Geist, JetBrains_Mono } from "next/font/google"
import { NextIntlClientProvider, hasLocale } from "next-intl"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { routing } from "@/i18n/routing"
import { SITE_URL, SITE_URL_CONFIGURED, pageMeta } from "@/lib/site"
import { speedRange } from "@/lib/plans"
import "../globals.css"
import { MOTION_INIT_SCRIPT } from "@/lib/motion-init"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: "meta" })
  const description = t("description", speedRange())
  return {
    metadataBase: new URL(SITE_URL),
    ...pageMeta(locale, "/", t("title"), description, (await getTranslations({ locale, namespace: "seo" }))("ogAlt")),
    ...(SITE_URL_CONFIGURED ? {} : { robots: { index: false, follow: false } }),
  }
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  return (
    // suppressHydrationWarning: the pre-paint script may add data-motion.
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${geistSans.variable} ${jetbrainsMono.variable} dark h-full antialiased`}
    >
      <head>
        {/* Applies a stored "pause animations" choice before first paint (lib/motion.ts). */}
        <script dangerouslySetInnerHTML={{ __html: MOTION_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <div
          aria-hidden
          className="holo-grid pointer-events-none fixed inset-0 -z-10"
        />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
