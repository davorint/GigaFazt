import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"
import es from "@/messages/es.json"
import en from "@/messages/en.json"
import { routing } from "@/i18n/routing"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Messages read directly: next-intl's request APIs aren't available while
// image metadata is generated at build time.
const MESSAGES = { es, en } as const
const messagesFor = (locale: string) => MESSAGES[locale === "en" ? "en" : "es"]

/** The brand lockup (public/brand) as a data URI for Satori. Cached: Cache Components forbids uncached IO here. */
async function lockupDataUri(): Promise<string> {
  "use cache"
  const svg = await readFile(join(process.cwd(), "public/brand/gigafazt-lockup.svg"))
  return `data:image/svg+xml;base64,${svg.toString("base64")}`
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

/** Localized alt text (no hard-coded copy). One image per locale. */
export async function generateImageMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  return [{ id: "default", alt: messagesFor(locale).seo.ogAlt, size, contentType }]
}

/**
 * Default OG image per locale. No price on it: hard rule #5 needs fee/term next
 * to any price, which doesn't fit a share card. Brand lockup once COMPANY_NAME is set.
 */
export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const m = messagesFor(locale)
  const hero = m.hero
  const logoSrc = await lockupDataUri()
  const zones = m.seo.ogZones

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#030712",
          backgroundImage:
            "radial-gradient(circle at 85% 20%, rgba(6,182,212,0.35), transparent 45%), linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "100% 100%, 48px 48px, 48px 48px",
          color: "#f4f4f5",
          fontFamily: "sans-serif",
        }}
      >
        {!isPlaceholder(company.name) && (
          <div style={{ display: "flex", marginBottom: 40, marginLeft: -10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>, next/image doesn't apply */}
            <img src={logoSrc} width={309} height={80} alt={company.name} />
          </div>
        )}
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: "#06b6d4" }}>
          [ {hero.eyebrow} ]
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 76, fontWeight: 700, lineHeight: 1.05, maxWidth: 980 }}>
          {hero.h1NoPrice}
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 30, color: "#a1a1aa" }}>{zones}</div>
      </div>
    ),
    size
  )
}
