import type { Metadata } from "next"
import { setRequestLocale } from "next-intl/server"
import { notFound } from "next/navigation"
import { LoginForm } from "@/components/interno/LoginForm"
import copy from "@/messages/internal/interno.es.json"

/**
 * /interno/entrar: the only internal page served without the password. The form posts to /api/interno/entrar, which
 * sets the session cookie. Noindex, Spanish only.
 */
export const metadata: Metadata = {
  title: { absolute: copy.interno.meta.titleLogin },
  description: null,
  alternates: null,
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
}

export default async function EntrarPage({ params }: PageProps<"/[locale]/interno/entrar">) {
  const { locale } = await params
  if (locale !== "es") notFound()
  setRequestLocale(locale)
  const t = copy.interno
  return (
    <main className="mx-auto grid min-h-[70svh] w-full max-w-md content-center px-4 py-16 sm:px-6">
      <p className="eyebrow">{t.kicker}</p>
      <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground">{t.login.title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-300">{t.login.lead}</p>
      <LoginForm labels={{ password: t.login.password, submit: t.login.submit, error: t.login.error }} />
    </main>
  )
}
