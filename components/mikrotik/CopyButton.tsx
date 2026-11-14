"use client"

import { useEffect, useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Copies `text` (or the result of `getText`) and confirms in place, announced politely. */
export function CopyButton({
  text,
  getText,
  label,
  done,
  size = "sm",
  variant = "outline",
}: {
  text?: string
  getText?: () => string
  label: string
  done: string
  size?: "sm" | "default"
  variant?: "outline" | "default"
}) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 1800)
    return () => window.clearTimeout(id)
  }, [copied])

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText ? getText() : (text ?? ""))
          setCopied(true)
        } catch {
          // Clipboard blocked (insecure origin or permissions): nothing to confirm.
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{copied ? done : label}</span>
    </Button>
  )
}
