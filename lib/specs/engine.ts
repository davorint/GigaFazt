/**
 * Product types and their characteristics (owner, 2026-11-19: "hardcoded the product types, characteristics, etc. In the
 * DB the actual products"). Each catalog (materials, tools) lists, per category, its product types and, per type, the
 * characteristic fields it has; every field is a fixed menu or a number. A product in the database only stores its type
 * and the values picked; anything the menus don't cover goes in its notes, and a missing option is added here in code.
 */

export type SpecField =
  | { kind: "pick"; options: readonly string[] }
  | { kind: "number"; unit: string; min: number; max: number; integer?: boolean }

/** A catalog: the fields it can use, and per category the product types with the fields each one has. */
export type SpecCatalog<C extends string> = {
  fields: Record<string, SpecField>
  types: Record<C, Record<string, readonly string[]>>
}

/** The values picked for a product: field → option or number. Only fields of its type are kept. */
export type Specs = Record<string, string | number>

export const typesOf = <C extends string>(cat: SpecCatalog<C>, category: C): string[] => Object.keys(cat.types[category] ?? {})
export const fieldsOf = <C extends string>(cat: SpecCatalog<C>, category: C, type: string): readonly string[] => cat.types[category]?.[type] ?? []

/** A stored type for this category, or "" when it isn't one (other category, removed from the code, typo). */
export function decodeType<C extends string>(cat: SpecCatalog<C>, category: C, v: unknown): string {
  return typeof v === "string" && Object.hasOwn(cat.types[category] ?? {}, v) ? v : ""
}

/** Keeps only the type's fields with an allowed value. */
export function decodeSpecs<C extends string>(cat: SpecCatalog<C>, category: C, type: string, v: unknown): Specs {
  const out: Specs = {}
  if (!type || !v || typeof v !== "object" || Array.isArray(v)) return out
  const o = v as Record<string, unknown>
  for (const key of fieldsOf(cat, category, type)) {
    const f = cat.fields[key]
    const x = o[key]
    if (!f) continue
    if (f.kind === "pick") {
      if (typeof x === "string" && f.options.includes(x)) out[key] = x
    } else if (typeof x === "number" && Number.isFinite(x) && x >= f.min && x <= f.max && (!f.integer || Number.isInteger(x))) out[key] = x
  }
  return out
}

/** Changing the type (or category) drops the values the new type doesn't have. */
export function retype<C extends string>(cat: SpecCatalog<C>, category: C, type: string, specs: Specs): Specs {
  return decodeSpecs(cat, category, type, specs)
}
