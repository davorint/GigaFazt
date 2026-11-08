// Playwright screenshots of every [data-section] at 390px and 1440px, with
// motion "no-preference" and "reduce". WebGL is forced on via SwiftShader so
// R3F renders headless. Logs page/console errors; exits non-zero if any.
//
// Usage: node scripts/screenshot.mjs [url] [outDir]
//   SECTIONS=hero,plans node scripts/screenshot.mjs
import { chromium } from "@playwright/test"
import { mkdir } from "node:fs/promises"
import path from "node:path"

const url = process.argv[2] || process.env.SHOT_URL || "http://localhost:3000/es"
const outDir = process.argv[3] || ".screenshots"
const filter = process.env.SECTIONS
  ? process.env.SECTIONS.split(",").map((s) => s.trim()).filter(Boolean)
  : null

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "1440", width: 1440, height: 900 },
]
const motions = /** @type {const} */ (["no-preference", "reduce"])

const WEBGL_FLAGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
]

async function main() {
  await mkdir(outDir, { recursive: true })
  const browser = await chromium.launch({ args: WEBGL_FLAGS })
  const errors = []

  for (const viewport of viewports) {
    for (const motion of motions) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        reducedMotion: motion,
        deviceScaleFactor: 1,
      })
      // Scroll-driven reveals depend on scroll position, and element captures
      // taller than the viewport would show their lower parts mid-reveal.
      // `data-shot` turns the reveals off (globals.css) for static captures.
      await context.addInitScript(() => {
        const mark = () => document.documentElement?.setAttribute("data-shot", "")
        if (document.documentElement) mark()
        else
          new MutationObserver((_, obs) => {
            if (!document.documentElement) return
            mark()
            obs.disconnect()
          }).observe(document, { childList: true })
      })
      const openPage = async () => {
        const p = await context.newPage()
        p.on("console", (msg) => {
          if (msg.type() === "error") {
            const text = `[console:${viewport.name}:${motion}] ${msg.text()}`
            errors.push(text)
            console.error(text)
          }
        })
        p.on("pageerror", (err) => {
          const text = `[pageerror:${viewport.name}:${motion}] ${err.message}`
          errors.push(text)
          console.error(text)
        })
        return p
      }
      let page = await openPage()

      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
      } catch (err) {
        const text = `[goto:${viewport.name}:${motion}] ${String(err)}`
        errors.push(text)
        console.error(text)
        await context.close()
        continue
      }

      let ids = await page.$$eval("[data-section]", (els) =>
        els.map((e) => e.getAttribute("data-section")).filter(Boolean)
      )
      if (filter) ids = ids.filter((id) => filter.includes(id))

      for (const id of ids) {
        // One retry in a fresh page: stacked WebGL contexts (hero, fiber scene,
        // map preloading) can stall a single SwiftShader load.
        for (let attempt = 1; attempt <= 2; attempt++) {
          const el = page.locator(`[data-section="${id}"]`).first()
          try {
            // Generous: a fresh page jumping to a WebGL section compiles shaders on
            // SwiftShader, which can block the renderer for several seconds.
            await el.scrollIntoViewIfNeeded({ timeout: 60000 })
            await page.waitForTimeout(1200)
            // Lazy maps signal readiness via [data-map-ready]; wait for it if present.
            if (await el.locator(".maplibregl-map, [data-map]").count()) {
              await el
                .locator("[data-map-ready]")
                .first()
                .waitFor({ timeout: 10000 })
                .catch(() => console.warn(`[shot:${id}] map not ready after 10 s`))
            }
            // Fallback: after an element taller than the viewport is captured,
            // Playwright's "element stable" wait can hang on the next (static,
            // measured-stable) element. Then capture a full-page clip of its box.
            const file = path.join(outDir, `${id}--${viewport.name}--${motion}.png`)
            // Tall sections (plans at 390 px ≈ 3.5k px) take ~11 s under SwiftShader.
            await el.screenshot({ path: file, timeout: 30000 }).catch(async () => {
              const box = await el.evaluate((n) => {
                const r = n.getBoundingClientRect()
                return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }
              })
              // Full-page capture brings every running CSS loop on screen, which can
              // stall SwiftShader; freeze CSS animations for this fallback only.
              await page.screenshot({ path: file, fullPage: true, clip: box, animations: "disabled", timeout: 60000 })
            })
            console.log(`✓ ${id}--${viewport.name}--${motion}.png`)
            // After a section taller than the viewport, continue in a fresh page
            // (starts at the top, no scroll restoration) so the next element
            // capture doesn't hit the "element stable" hang above, whose
            // full-page fallback must render every WebGL scene under SwiftShader.
            const tall = await el.evaluate((n) => n.getBoundingClientRect().height > innerHeight)
            if (tall) {
              await page.close()
              page = await openPage()
              await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
            }
            break
          } catch (err) {
            const text = `[shot:${id}:${viewport.name}:${motion}] ${String(err)}`
            if (attempt === 2) {
              errors.push(text)
              console.error(text)
            } else {
              console.warn(`${text} (retrying in a fresh page)`)
              await page.close()
              page = await openPage()
              await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })
            }
          }
        }
      }

      await context.close()
    }
  }

  await browser.close()

  if (errors.length > 0) {
    console.error(`\n${errors.length} error(s) during screenshot run.`)
    process.exit(1)
  }
  console.log("\nScreenshots complete with no errors.")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
