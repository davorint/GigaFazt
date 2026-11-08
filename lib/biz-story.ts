/**
 * /empresas scroll story (owner, 2026-11-08): the hero pins on wide desktop
 * screens with motion allowed, and scrolling walks the 3D building through
 * four chapters. Shared by the chapter driver (BizStory) and the scene
 * (BuildingScene) so text and camera stay in step.
 *
 * Keep STORY_MEDIA in sync with the `.biz-story` rules in globals.css.
 */
export const STORY_MEDIA = "(min-width: 1024px) and (pointer: fine) and (prefers-reduced-motion: no-preference)"

/** Chapters after the intro (0 = the hero itself). */
export const STORY_CHAPTERS = 4
/** Progress is stretched a little past the last key so the last chapter holds before the pin ends. */
const STRETCH = 4.5

export function storyEnabled(): boolean {
  if (typeof window === "undefined") return false
  const root = document.documentElement
  return window.matchMedia(STORY_MEDIA).matches && root.dataset.motion !== "off" && !root.hasAttribute("data-shot")
}

/** 0 (pin starts) … 1 (pin ends), from the story wrapper's position. */
export function storyProgress(el: HTMLElement): number {
  const r = el.getBoundingClientRect()
  const run = r.height - window.innerHeight
  return run > 0 ? Math.min(1, Math.max(0, -r.top / run)) : 0
}

/** Continuous chapter position, 0 … STORY_CHAPTERS. */
export function storyPosition(p: number): number {
  return Math.min(STORY_CHAPTERS, p * STRETCH)
}
