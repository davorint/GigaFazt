"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { Menu, MapPin, Layers, MessageCircle } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { track } from "@/lib/analytics"
import { Brand } from "./Brand"
import { StatusBadge } from "./StatusBadge"
import { LocaleToggle } from "./LocaleToggle"
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

const SECTION_IDS = ["hero", "fiber", "plans", "map", "faq"]

export function Nav() {
  const t = useTranslations("nav")
  const [condensed, setCondensed] = useState(false)
  const [active, setActive] = useState("hero")
  const [pastHero, setPastHero] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuMounted, setMenuMounted] = useState(false)

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
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
  }, [])

  const openMenu = () => {
    setMenuMounted(true)
    setMenuOpen(true)
  }

  const whatsappReady = !isPlaceholder(company.whatsapp)

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
          aria-label="Principal"
        >
          <Brand />

          <div className="hidden items-center gap-1 md:flex">
            {LINKS.map((link) => {
              const isActive = active === link.href.slice(1)
              return (
                <a
                  key={link.key}
                  href={link.href}
                  aria-current={isActive ? "true" : undefined}
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
            <LocaleToggle className="hidden sm:flex" />
            <Button
              size="sm"
              className="hidden font-mono text-xs tracking-wider shadow-[0_0_20px_-4px_var(--color-fiber)] sm:inline-flex"
              onClick={() => {
                track("plan_selected", { context: "nav" })
                document
                  .getElementById("plans")
                  ?.scrollIntoView({ behavior: "smooth" })
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
        <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} links={LINKS} />
      )}

      {/* Mobile sticky bottom bar, appears after the hero (SPEC §1). */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-border bg-background/90 backdrop-blur-md transition-transform duration-200 md:hidden",
          pastHero ? "translate-y-0" : "translate-y-full"
        )}
      >
        <a
          href="#map"
          className="flex flex-col items-center gap-0.5 py-2 text-xs text-muted-foreground"
        >
          <MapPin className="size-4" />
          {t("cobertura")}
        </a>
        <a
          href="#plans"
          className="flex flex-col items-center gap-0.5 border-x border-border py-2 text-xs text-muted-foreground"
        >
          <Layers className="size-4" />
          {t("planes")}
        </a>
        {whatsappReady ? (
          <a
            href={`https://wa.me/${String(company.whatsapp).replace(/\D/g, "")}`}
            onClick={() => track("whatsapp_clicked", { context: "bottombar" })}
            className="flex flex-col items-center gap-0.5 py-2 text-xs text-ok"
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
      </div>
    </>
  )
}
