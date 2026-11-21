import type { ReactNode } from "react"
import { NextIntlClientProvider } from "next-intl"
import { AdminLinks } from "@/components/interno/AdminLinks"
import { SyncBar } from "@/components/interno/SyncBar"
import syncCopy from "@/messages/internal/sync.es.json"
import wisp from "@/messages/internal/wispdavor.es.json"

const messages = { ...wisp, ...syncCopy }

/** The frame of every WispDavor page: back link (sub-pages), title, menu, sync bar and the page's app. */
export function WispFrame({ title, lead, sub, children }: { title: string; lead?: string; sub?: boolean; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
      <section data-section="wispdavor" className="pt-8 pb-2 sm:pt-14">
        {sub && (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (proxy.ts checks the session and rewrites it)
          <a href="/interno/software/wispdavor" className="inline-flex min-h-9 items-center text-sm text-zinc-300 hover:text-foreground">
            {wisp.wispdavor.back}
          </a>
        )}
        <p className="eyebrow mt-2">{wisp.wispdavor.kicker}</p>
        <h1 className="mt-3 text-4xl font-light tracking-tight text-foreground sm:text-5xl">{title}</h1>
        {lead && <p className="mt-3 max-w-2xl text-base leading-relaxed text-zinc-300">{lead}</p>}
        <AdminLinks current="software" />
      </section>
      <NextIntlClientProvider locale="es" messages={messages}>
        <SyncBar />
        {children}
      </NextIntlClientProvider>
    </main>
  )
}
