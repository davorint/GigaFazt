"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { Menu, MapPin, Layers, MessageCircle } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { whatsappHref } from "@/lib/contact"
import { track } from "@/lib/analytics"
import { scrollToId } from "@/lib/scroll"
import { Brand } from "./Brand"
import { StatusBadge } from "./StatusBadge"
import { LocaleToggle } from "./LocaleToggle"
import { MotionToggle } from "./MotionToggle"
import { PlaceholderChip } from "./PlaceholderChip"

// Lazy so Base UI's dialog isn't in the initial bundle (perf budget, hard rule #8).
const MobileMenu = dynamic(() =>
  import("./MobileMenu").then((m) => m.MobileMenu)
)

const LINKS = [
  { key: "fibra", href: "#fiber" },
  { key: "planes", href: "#plans" },
  { key: "cobertura", href: "#map" },
  { key: "soporte", href: "#faq" },
] as const

/** Separate pages (not home sections), so the home page stays light. */
const PAGES = [{ key: "empresas", path: "/empresas" }] as const

const SECTION_IDS = ["hero", "fiber", "plans", "map", "faq"]

/**
 * `base` prefixes the hash links when rendered off the home page (e.g. "/es").
 * `current` marks the page link of the page being viewed.
 */
export function Nav({ base = "", current }: { base?: string; current?: (typeof PAGES)[number]["key"] }) {
  const t = useTranslations("nav")
  const locale = useLocale()
  const router = useRouter()
  const links = [
    ...LINKS.map((l) => ({ key: l.key as string, href: `${base}${l.href}`, page: false })),
    ...PAGES.map((p) => ({ key: p.key as string, href: `/${locale}${p.path}`, page: true })),
  ]
  const [condensed, setCondensed] = useState(false)
  // Off the home page there is no #hero: show the bottom bar from the start and
  // skip section tracking (its links point back to the home page).
  const [active, setActive] = useState(base ? "" : "hero")
  const [pastHero, setPastHero] = useState(!!base)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMounted, setMenuMounted] = useState(false)

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (base) return
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => el !== null
    )
    if (sections.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id)
            if (entry.target.id === "hero") setPastHero(false)
          }
          if (entry.target.id === "hero" && !entry.isIntersecting) {
            setPastHero(true)
          }
        }
      },
      { rootMargin: "-45% 0px -45% 0px" }
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [base])

  const openMenu = () => {
    setMenuMounted(true)
    setMenuOpen(true)
  }

  const whatsapp = isPlaceholder(company.whatsapp) ? null : company.whatsapp

  return (
    <>
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-200",
          condensed
            ? "border-b border-border bg-background/80 backdrop-blur-md"
            : "border-b border-transparent bg-transparent"
        )}
      >
        <nav
          className={cn(
            "mx-auto flex max-w-7xl items-center justify-between px-4 transition-all duration-200 sm:px-6",
            condensed ? "h-12" : "h-16"
          )}
          aria-label={t("main")}
        >
          <Brand href={base || "#hero"} />

          <div className="hidden items-center gap-1 md:flex">
            {links.map((link) => {
              const isPage = link.page && current === link.key
              const isActive = isPage || (!link.page && active === link.href.split("#")[1])
              return (
                <a
                  key={link.key}
                  href={link.href}
                  aria-current={isPage ? "page" : isActive ? "true" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(link.key)}
                </a>
              )
            })}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <StatusBadge className="hidden sm:inline-flex" />
            <MotionToggle className="hidden sm:inline-flex" />
            <LocaleToggle className="hidden sm:flex" />
            <Button
              size="sm"
              className="hidden font-mono text-xs tracking-wider shadow-[0_0_20px_-4px_var(--color-fiber)] sm:inline-flex"
              onClick={() => {
                track("plan_selected", { context: "nav" })
                if (!scrollToId("plans")) router.push(`${base}#plans`)
              }}
            >
              [ {t("viewPlans").toUpperCase()} ]
            </Button>

            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              aria-label={t("openMenu")}
              aria-expanded={menuOpen}
              onClick={openMenu}
            >
              <Menu />
            </Button>
          </div>
        </nav>
      </header>

      {menuMounted && (
        <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} links={links} home={base || "#hero"} />
      )}

      {/* Mobile sticky bottom bar, appears after the hero (SPEC §1). Inert while
          hidden so its links aren't keyboard-reachable off screen. */}
      <nav
        aria-label={t("quick")}
        inert={!pastHero}
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background/90 backdrop-blur-md transition-transform duration-200 md:hidden",
          pastHero ? "translate-y-0" : "translate-y-full"
        )}
      >
        <a
          href={`${base}#map`}
          className="flex flex-col items-center gap-0.5 py-2 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none text-muted-foreground"
        >
          <MapPin className="size-4" />
          {t("cobertura")}
        </a>
        <a
          href={`${base}#plans`}
          className="flex flex-col items-center gap-0.5 border-x border-border py-2 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none text-muted-foreground"
        >
          <Layers className="size-4" />
          {t("planes")}
        </a>
        {whatsapp ? (
          <a
            href={whatsappHref(whatsapp)}
            onClick={() => track("whatsapp_clicked", { context: "bottombar" })}
            className="flex flex-col items-center gap-0.5 py-2 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none text-ok"
          >
            <MessageCircle className="size-4" />
            {t("whatsapp")}
          </a>
        ) : (
          <span className="flex flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground">
            <MessageCircle className="size-4 opacity-50" />
            {isPlaceholder(company.whatsapp) && (
              <PlaceholderChip keyName={company.whatsapp.key} />
            )}
          </span>
        )}
      </nav>
    </>
  )
}
