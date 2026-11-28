"use client"

import { useMemo } from "react"
import { CodeBlock } from "./CodeBlock"
import { ViewChoice } from "./ViewChoice"
import { useCli } from "./CliContext"
import { CliSteps } from "./CliSteps"

/** One MikroTik script: as it is, or as CLI pieces when the page shows commands (the switch sits above it). */
export function RouterScript({ code, label }: { code: string; label: string }) {
  const cli = useCli()
  const steps = useMemo(() => [{ title: label, script: code }], [code, label])
  if (!cli) return <CodeBlock code={code} label={label} />
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xs text-zinc-400">{label}</p>
        <ViewChoice compact />
      </div>
      {cli.view === "cli" ? <CliSteps steps={steps} /> : <CodeBlock code={code} label={label} />}
    </div>
  )
}
