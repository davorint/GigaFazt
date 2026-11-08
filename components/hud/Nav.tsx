"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Menu, MapPin, Layers, MessageCircle, Network } from "lucide-react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { whatsappHref } from "@/lib/contact"
import { track } from "@/lib/analytics"
import { scrollToId } from "@/lib/scroll"
import { Brand } from "./Brand"
import { SmartLink } from "./SmartLink"
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
  { key: "wifi", href: "#wifi" },
  { key: "planes", href: "#plans" },
  { key: "cobertura", href: "#map" },
  { key: "soporte", href: "#faq" },
] as const

/** Separate pages (not home sections), so the home page stays light. */
const PAGES = [{ key: "empresas", path: "/empresas" }] as const

const SECTION_IDS = ["hero", "plans", "fiber", "wifi", "map", "faq"]

/**
 * `base` prefixes the hash links when rendered off the home page (e.g. "/es").
 * `current` marks the page link of the page being viewed.
 *
 * 2026-11-07: links sit in a glass pill with a sliding cyan underline under
 * the active section; a thin scroll-progress line runs along the bottom of the
 * condensed bar (transform only, written outside React); the CTA is a pill.
 */
export function Nav({ base = "", current }: { base?: string; current?: (typeof PAGES)[number]["key"] }) {
  const t = useTranslations("nav")
  const tb = useTranslations("business")
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
  const progressRef = useRef<HTMLSpanElement>(null)
  const linksRef = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null)

  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      setCondensed(window.scrollY > 8)
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
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

  // Sliding underline: measure the active link inside the pill.
  const activeKey =
    links.find((l) => (l.page ? current === l.key : active === l.href.split("#")[1]))?.key ?? null
  useLayoutEffect(() => {
    const measure = () => {
      const el = activeKey ? linksRef.current?.querySelector<HTMLElement>(`[data-key="${activeKey}"]`) : null
      setBar(el ? { left: el.offsetLeft + 12, width: el.offsetWidth - 24 } : null)
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [activeKey])

  const openMenu = () => {
    setMenuMounted(true)
    setMenuOpen(true)
  }

  const whatsapp = isPlaceholder(company.whatsapp) ? null : company.whatsapp
  // /empresas: the CTA and the phone bottom bar lead to a quote, not to the consumer plans.
  const biz = current === "empresas"
  const bizQuoteHref = whatsapp ? whatsappHref(whatsapp, tb("whatsappMessage")) : "#business-cta"
  const quickLinks = biz
    ? [
        { href: "#business-internet", label: t("bizInternet"), Icon: Layers },
        { href: "#business-networks", label: t("bizNetworks"), Icon: Network },
      ]
    : [
        { href: `${base}#map`, label: t("cobertura"), Icon: MapPin },
        { href: `${base}#plans`, label: t("planes"), Icon: Layers },
      ]

  return (
    <>
      <header data-site-nav
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

          <div
            ref={linksRef}
            className={cn(
              "relative hidden items-center gap-0.5 rounded-full border px-1.5 py-1 transition-colors duration-200 md:flex",
              condensed ? "border-white/10 bg-white/[0.03]" : "border-transparent"
            )}
          >
            {links.map((link) => {
              const isPage = link.page && current === link.key
              const isActive = isPage || (!link.page && active === link.href.split("#")[1])
              return (
                <SmartLink
                  key={link.key}
                  data-key={link.key}
                  href={link.href}
                  aria-current={isPage ? "page" : isActive ? "true" : undefined}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(link.key)}
                </SmartLink>
              )
            })}
            <span
              aria-hidden
              className={cn(
                "pointer-events-none absolute bottom-0.5 left-0 h-[2px] rounded-full bg-fiber shadow-[0_0_8px_var(--color-fiber)] transition-[transform,width,opacity] duration-250 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
                bar ? "opacity-100" : "opacity-0"
              )}
              style={bar ? { width: bar.width, transform: `translateX(${bar.left}px)` } : { width: 0 }}
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <StatusBadge className="hidden sm:inline-flex" />
            <MotionToggle className="hidden sm:inline-flex" />
            <LocaleToggle className="hidden sm:flex" />
            {biz ? (
              // Business mode: the page's one action (a quote) instead of the consumer plans.
              <a
                href={bizQuoteHref}
                {...(whatsapp ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                onClick={() => whatsapp && track("whatsapp_clicked", { context: "nav_business" })}
                className="group hidden h-8 items-center gap-1.5 rounded-full bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none sm:inline-flex"
              >
                {t("quote")}
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </a>
            ) : (
              <Button
                size="sm"
                className="group hidden h-8 gap-1.5 px-4 sm:inline-flex"
                onClick={() => {
                  track("plan_selected", { context: "nav" })
                  if (!scrollToId("plans")) router.push(`${base}#plans`)
                }}
              >
                {t("viewPlans")}
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Button>
            )}

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
        {/* Scroll progress along the bottom edge of the condensed bar. */}
        <span
          aria-hidden
          ref={progressRef}
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-[-1px] h-px origin-left bg-gradient-to-r from-fiber/40 via-fiber to-[#a5f3fc] shadow-[0_0_8px_var(--color-fiber)] transition-opacity duration-200",
            condensed ? "opacity-100" : "opacity-0"
          )}
          style={{ transform: "scaleX(0)" }}
        />
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
          "fixed inset-x-0 bottom-0 z-40 grid grid-cols-3 border-t border-white/[0.08] bg-background/80 backdrop-blur-xl transition-transform duration-200 md:hidden",
          pastHero ? "translate-y-0" : "translate-y-full"
        )}
      >
        {quickLinks.map(({ href, label, Icon }, i) => (
          <SmartLink
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none text-muted-foreground",
              i === 1 && "border-x border-border"
            )}
          >
            <Icon className="size-4" />
            {label}
          </SmartLink>
        ))}
        {whatsapp ? (
          <a
            href={biz ? bizQuoteHref : whatsappHref(whatsapp)}
            onClick={() => track("whatsapp_clicked", { context: biz ? "bottombar_business" : "bottombar" })}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-xs focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:outline-none",
              biz ? "font-medium text-white" : "text-muted-foreground"
            )}
          >
            <MessageCircle className="size-4 text-ok" />
            {biz ? t("quote") : t("whatsapp")}
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
