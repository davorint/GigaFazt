"use client"

import { useTranslations } from "next-intl"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Brand } from "./Brand"
import { StatusBadge } from "./StatusBadge"
import { LocaleToggle } from "./LocaleToggle"
import { MotionToggle } from "./MotionToggle"

/**
 * Mobile nav drawer. Lazy-loaded from Nav (next/dynamic) so Base UI's dialog
 * stays out of the initial bundle until the user opens the menu.
 */
export function MobileMenu({
  open,
  onOpenChange,
  links,
  home,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  links: readonly { key: string; href: string }[]
  home: string
}) {
  const t = useTranslations("nav")
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 bg-surface">
        <SheetHeader>
          <SheetTitle className="font-mono text-sm">
            <Brand href={home} />
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4">
          {links.map((link) => (
            <SheetClose
              key={link.key}
              render={
                <a
                  href={link.href}
                  className="rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {t(link.key)}
                </a>
              }
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-border px-4 pt-4">
          <StatusBadge />
          <LocaleToggle />
        </div>
        <div className="px-4 pt-4">
          <MotionToggle withLabel />
        </div>
      </SheetContent>
    </Sheet>
  )
}
