"use client"

import { CodeBlock } from "./CodeBlock"

export type ShownStep = { title: string; script: string; before?: string; verify?: string }

/**
 * A script as numbered steps: each with its own copy button, what must be true before pasting it and a command that
 * shows it worked. Paste them in order, one at a time.
 */
export function StepList({ steps, labels }: { steps: ShownStep[]; labels: { step: string; before: string; verify: string } }) {
  return (
    <ol className="grid gap-5">
      {steps.map((s, k) => (
        <li key={k} className="grid min-w-0 gap-2 border-l-2 border-white/10 pl-4">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-xs text-zinc-400">
              {labels.step} {k + 1}
            </span>
            <span className="text-sm font-medium text-foreground">{s.title}</span>
          </p>
          {s.before && (
            <p className="max-w-3xl text-xs leading-snug text-amber-200">
              {labels.before} {s.before}
            </p>
          )}
          <CodeBlock code={s.script} label={`${labels.step} ${k + 1} · ${s.title}`} />
          {s.verify && (
            <p className="text-xs leading-snug text-zinc-400">
              {labels.verify} <code className="font-mono text-zinc-200 [font-variant-ligatures:none]">{s.verify}</code>
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
