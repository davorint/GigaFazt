import { useTranslations } from "next-intl"
import { testimonials } from "@/lib/testimonials"

/** Testimonial slots (SPEC §6): rendered only when real, permitted ones exist. */
export function Testimonials() {
  const t = useTranslations("proof")
  if (testimonials.length === 0) return null

  return (
    <div>
      <h3 className="text-lg font-semibold tracking-[-0.02em]">{t("testimonials")}</h3>
      <ul className="mt-5 grid gap-4 md:grid-cols-3">
        {testimonials.map((q) => (
          <li key={q.name} className="rounded-xl border border-border bg-surface p-5">
            <blockquote className="text-sm">“{q.quote}”</blockquote>
            <p className="mt-3 font-mono text-xs text-muted-foreground">
              {q.name} · {q.area}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
