import { cn } from "cn"

const DIGITS = "0123456789".split("")

/**
 * A number whose digits roll like an odometer when it changes (globals.css
 * .roll-digit / .roll-strip; the ones digit moves first). Columns are keyed
 * from the right so each place keeps its column when the value changes.
 * Static under reduced motion / paused animations. Visual only (aria-hidden):
 * callers expose the value to assistive tech themselves.
 */
export function RollingNumber({ text, className }: { text: string; className?: string }) {
  const chars = text.split("")
  return (
    <span aria-hidden className={cn("inline-flex leading-none tabular-nums", className)}>
      {chars.map((c, i) => {
        const k = chars.length - 1 - i
        return /\d/.test(c) ? (
          <span key={`d${k}`} className="roll-digit">
            <span className="roll-strip" style={{ "--v": c, "--k": k } as React.CSSProperties}>
              {DIGITS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`c${k}`}>{c}</span>
        )
      })}
    </span>
  )
}
