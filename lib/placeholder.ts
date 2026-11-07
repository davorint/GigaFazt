/**
 * Visible-placeholder mechanism (CLAUDE.md hard rule #1).
 *
 * When a value is still a `{{PLACEHOLDER}}` in docs/BUSINESS.md we never invent
 * it. Instead the data layer stores a `Placeholder` sentinel carrying the
 * BUSINESS.md key, and the UI renders a visible "POR DEFINIR" chip. The sentinel
 * is a plain serializable object so it crosses the RSC boundary.
 */
export interface Placeholder {
  readonly __placeholder: true
  /** The BUSINESS.md key still unfilled, e.g. "COMPANY_NAME" or "hogar-1g.price". */
  readonly key: string
}

export type Maybe<T> = T | Placeholder

export function placeholder(key: string): Placeholder {
  return { __placeholder: true, key }
}

export function isPlaceholder(value: unknown): value is Placeholder {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Placeholder).__placeholder === true
  )
}

/** Resolve a Maybe to its value or a fallback, for non-UI consumers. */
export function valueOr<T>(value: Maybe<T>, fallback: T): T {
  return isPlaceholder(value) ? fallback : value
}

/** Collect every unfilled key from a tree of data, for logging open questions. */
export function collectPlaceholders(input: unknown, keys = new Set<string>()): string[] {
  if (isPlaceholder(input)) {
    keys.add(input.key)
  } else if (Array.isArray(input)) {
    for (const item of input) collectPlaceholders(item, keys)
  } else if (typeof input === "object" && input !== null) {
    for (const v of Object.values(input)) collectPlaceholders(v, keys)
  }
  return [...keys]
}
