import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import es from "../messages/es.json"
import en from "../messages/en.json"
import globalError from "../messages/global-error.json"
import { CLIENT_NAMESPACES, clientMessages } from "./i18n-client"

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) ? [p] : []
  })

describe("messages sent to the browser", () => {
  it("every namespace a client component reads from es.json is sent", () => {
    const site = new Set(Object.keys(es))
    const missing: string[] = []
    for (const f of [...walk("components"), ...walk("app")]) {
      const src = readFileSync(f, "utf8")
      if (!/^["']use client["']/m.test(src)) continue
      // A client component reading the messages without a namespace would need all of them.
      expect(src, f).not.toMatch(/useTranslations\(\s*\)|useMessages\(/)
      for (const m of src.matchAll(/useTranslations\(\s*"([a-zA-Z]+)/g)) {
        if (site.has(m[1]) && !(CLIENT_NAMESPACES as readonly string[]).includes(m[1])) missing.push(`${m[1]} (${f})`)
      }
    }
    expect(missing).toEqual([])
  })
  it("only those namespaces are picked, and they exist in both languages", () => {
    expect(Object.keys(clientMessages(es)).sort()).toEqual([...CLIENT_NAMESPACES].sort())
    expect(Object.keys(clientMessages(en)).sort()).toEqual([...CLIENT_NAMESPACES].sort())
  })
  it("the global error page's copy is the same as errorPage", () => {
    expect(globalError).toEqual({ es: es.errorPage, en: en.errorPage })
  })
})
