import { HEX, type Wire } from "@/lib/guides/utp"

type Names = Record<string, string>

/** One wire's swatch: solid, or white with its color as a stripe. */
export function WireSwatch({ wire, className = "" }: { wire: Wire; className?: string }) {
  const c = HEX[wire.color]
  const background = wire.white ? `repeating-linear-gradient(135deg, #f4f4f5 0 6px, ${c} 6px 10px)` : c
  return <span aria-hidden className={`block rounded-sm border border-white/20 ${className}`} style={{ background }} />
}

export const wireName = (wire: Wire, names: Names) => (wire.white ? names.white.replace("{color}", names[wire.color]) : names[wire.color].replace(/^./, (x) => x.toUpperCase()))

/**
 * An RJ45 plug seen from the contacts with the clip facing away: pin 1 on the left. Each pin's wire as a tall swatch
 * with its number above, and the full list as text below (the text equivalent of the drawing).
 */
export function UtpPlug({ title, wires, names, pinLabel }: { title: string; wires: Wire[]; names: Names; pinLabel: string }) {
  return (
    <figure className="grid gap-3 rounded-2xl border border-white/10 p-4">
      <figcaption className="font-mono text-sm text-foreground">{title}</figcaption>
      <div aria-hidden className="grid grid-cols-8 gap-1.5 rounded-xl border border-white/15 bg-white/[0.03] p-2 pt-1">
        {wires.map((wire, i) => (
          <div key={i} className="grid justify-items-center gap-1">
            <span className="font-mono text-xs text-zinc-300">{i + 1}</span>
            <WireSwatch wire={wire} className="h-20 w-full sm:h-24" />
          </div>
        ))}
      </div>
      <ol className="grid gap-1">
        {wires.map((wire, i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-zinc-200">
            <span className="w-14 shrink-0 font-mono text-xs text-zinc-400">
              {pinLabel} {i + 1}
            </span>
            <WireSwatch wire={wire} className="h-3 w-8 shrink-0" />
            {wireName(wire, names)}
          </li>
        ))}
      </ol>
    </figure>
  )
}
