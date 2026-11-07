import { ImageResponse } from "next/og"
import es from "@/messages/es.json"
import en from "@/messages/en.json"
import { routing } from "@/i18n/routing"
import { STATES } from "@/lib/geo/states"

export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// Messages read directly: next-intl's request APIs aren't available while
// image metadata is generated at build time.
const MESSAGES = { es, en } as const
const messagesFor = (locale: string) => MESSAGES[locale === "en" ? "en" : "es"]

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
 * to any price, which doesn't fit a share card. No brand until COMPANY_NAME.
 */
export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const hero = messagesFor(locale).hero
  const zones = STATES.map((s) => s.name).join(" · ")

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
