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
      const page = await context.newPage()

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = `[console:${viewport.name}:${motion}] ${msg.text()}`
          errors.push(text)
          console.error(text)
        }
      })
      page.on("pageerror", (err) => {
        const text = `[pageerror:${viewport.name}:${motion}] ${err.message}`
        errors.push(text)
        console.error(text)
      })

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
        const el = page.locator(`[data-section="${id}"]`).first()
        try {
          await el.scrollIntoViewIfNeeded({ timeout: 10000 })
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
          await el.screenshot({ path: file, timeout: 10000 }).catch(async () => {
            const box = await el.evaluate((n) => {
              const r = n.getBoundingClientRect()
              return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }
            })
            await page.screenshot({ path: file, fullPage: true, clip: box })
          })
          console.log(`✓ ${id}--${viewport.name}--${motion}.png`)
        } catch (err) {
          const text = `[shot:${id}:${viewport.name}:${motion}] ${String(err)}`
          errors.push(text)
          console.error(text)
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
