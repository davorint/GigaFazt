"use client"

import { useEffect, useRef } from "react"
import { storyEnabled, storyPosition, storyProgress, STORY_CHAPTERS } from "@/lib/biz-story"

/**
 * Wrapper of the /empresas hero scroll story. While the story is enabled
 * (lib/biz-story) it writes the current chapter to `data-chapter` (CSS
 * crossfades the copy) and the progress to `--story-p` (progress hairline),
 * outside React. Otherwise it stays at chapter 0: the plain hero.
 */
export function BizStory({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let chapter = -1
    const update = () => {
      raf = 0
      const on = storyEnabled()
      const p = on ? storyProgress(el) : 0
      const c = on ? Math.min(STORY_CHAPTERS, Math.round(storyPosition(p))) : 0
      if (c !== chapter) {
        chapter = c
        el.dataset.chapter = String(c)
      }
      el.style.setProperty("--story-p", (storyPosition(p) / STORY_CHAPTERS).toFixed(4))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    // Keyboard focus landing in the faded hero copy (e.g. shift+tab back up):
    // scroll to the top of the story so the focused control is visible.
    const onFocusIn = (e: FocusEvent) => {
      if (chapter > 0 && (e.target as Element | null)?.closest(".biz-story-intro")) {
        window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top, behavior: "instant" })
      }
    }
    update()
    el.addEventListener("focusin", onFocusIn)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    window.addEventListener("motionchange", onScroll)
    return () => {
      el.removeEventListener("focusin", onFocusIn)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      window.removeEventListener("motionchange", onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div ref={ref} data-biz-story data-chapter="0" className="biz-story relative">
      {children}
    </div>
  )
}
