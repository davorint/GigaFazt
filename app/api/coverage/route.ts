import { NextResponse } from "next/server"
import { z } from "zod"
import { coverageAreas } from "@/lib/coverage"
import type { CoverageResult } from "@/lib/types"

const schema = z.object({
  address: z.string().min(1).optional(),
  state: z.string().optional(),
  municipio: z.string().optional(),
  cp: z.string().optional(),
})

/**
 * Mock coverage lookup by municipio. The coverage list is empty until
 * BUSINESS.md is filled (hard rule #1, #6), so every lookup currently returns
 * "unavailable". The matching logic is in place for when real areas exist.
 */
export async function POST(request: Request) {
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 422 })
  }

  const { municipio, address } = parsed.data
  const needle = (municipio ?? address ?? "").toLowerCase().trim()
  const area = needle
    ? coverageAreas.find((a) => a.name.toLowerCase().includes(needle))
    : undefined

  const result: CoverageResult = area
    ? {
        status: area.status === "available" ? "available" : "planned",
        area,
        eta: area.eta,
      }
    : { status: "unavailable" }

  return NextResponse.json(result)
}
