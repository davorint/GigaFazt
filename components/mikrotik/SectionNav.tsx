"use client"

import { useEffect, useState } from "react"

/**
 * Section menu that stays at the top while scrolling (one row, scrolls
 * sideways on phones) and marks the section on screen.
 */
export function SectionNav({ label, items }: { label: string; items: { id: string; label: string }[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const sections = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null)
    // The section crossing the middle of the screen is the current one.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: "-45% 0px -50% 0px" }
    )
    sections.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [items])

  // Keep the current link visible in the scrolling row. Only the row moves: scrollIntoView would also
  // scroll the page back to the menu when it isn't sticky (screenshot captures).
  useEffect(() => {
    if (!active) return
    const link = document.querySelector<HTMLElement>(`[data-nav-link="${active}"]`)
    const row = link?.closest("ul")
    if (!link || !row) return
    const l = link.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    if (l.left < r.left) row.scrollLeft -= r.left - l.left
    else if (l.right > r.right) row.scrollLeft += l.right - r.right
  }, [active])

  // Phones: one row that scrolls sideways, faded at an edge while more links are hidden that way.
  const [edges, setEdges] = useState({ left: false, right: false })
  useEffect(() => {
    const row = document.querySelector<HTMLElement>(`[data-nav-row="${label}"]`)
    if (!row) return
    const update = () => setEdges({ left: row.scrollLeft > 1, right: row.scrollLeft + row.clientWidth < row.scrollWidth - 1 })
    update()
    row.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(row)
    return () => {
      row.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [label, items])
  const fade = 28
  const mask = edges.left || edges.right ? `linear-gradient(to right, ${edges.left ? `transparent, #000 ${fade}px` : "#000"}, ${edges.right ? `#000 calc(100% - ${fade}px), transparent` : "#000"})` : undefined

  return (
    // Static in screenshot captures (html[data-shot]) so it doesn't cover the section being shot.
    <nav
      aria-label={label}
      className="sticky top-0 z-30 -mx-4 border-b border-white/10 bg-background/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 [html[data-shot]_&]:static"
    >
      {/* From tablets up the links wrap onto a second line instead of hiding past the edge (no scrollbar for a mouse). */}
      <ul
        data-nav-row={label}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="flex gap-1 overflow-x-auto py-2 text-sm [scrollbar-width:none] md:flex-wrap md:overflow-visible md:[mask-image:none]! md:[-webkit-mask-image:none]!"
      >
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              data-nav-link={i.id}
              aria-current={active === i.id ? "location" : undefined}
              className="block rounded-md px-2.5 py-1.5 text-zinc-400 transition-colors hover:text-foreground aria-[current=location]:bg-white/10 aria-[current=location]:text-foreground"
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
