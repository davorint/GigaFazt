import { useTranslations } from "next-intl"
import { cn } from "cn"

/**
 * Mono tag for any metric not wired to a real source (hard rule #2).
 * `sim` → SIMULACIÓN (mock telemetry), `demo` → DEMO DATA (illustrative example).
 */
export function SimTag({ kind = "sim", className }: { kind?: "sim" | "demo"; className?: string }) {
  const t = useTranslations("common")
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-warn/40 bg-warn/10 px-1.5 py-0.5 font-mono text-[0.6rem] uppercase tracking-[0.15em] text-warn",
        className
      )}
    >
      {kind === "sim" ? t("simulacion") : t("demoData")}
    </span>
  )
}
