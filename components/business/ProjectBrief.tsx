"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, MessageCircle, XIcon } from "lucide-react"
import { cn } from "cn"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PlaceholderChip } from "@/components/hud/PlaceholderChip"
import { company } from "@/lib/company"
import { isPlaceholder } from "@/lib/placeholder"
import { whatsappHref } from "@/lib/contact"
import { track } from "@/lib/analytics"
import { INTERNET_TIERS, business } from "@/lib/business"
import {
  BRIEF_FLOORS,
  BRIEF_NEEDS,
  BRIEF_PEOPLE,
  BRIEF_SPACES,
  BRIEF_WHEN,
  brief,
  briefFrom,
  briefStepComplete,
  type BriefAnswers,
  type BriefPreset,
} from "@/lib/brief"

const STEPS = 4

/**
 * The /empresas project brief (lib/brief): what you need → your space → size
 * and timing → summary, then WhatsApp opens with the summary as the first
 * message. Native radios/checkboxes styled as tiles (keyboard and screen
 * reader friendly), focus moves to each step's heading, and a polite status
 * line announces the step. Loaded on the first "Cotizar proyecto" (BriefHost),
 * so Base UI's dialog stays out of the first load.
 */
export default function ProjectBrief({
  open,
  preset,
  context,
  request,
}: {
  open: boolean
  preset?: BriefPreset
  context?: string
  request: number
}) {
  const t = useTranslations("business.brief")
  const tb = useTranslations("business")
  const [step, setStep] = useState(0)
  const [a, setA] = useState<BriefAnswers>(() => briefFrom(preset))
  const heading = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)

  // Every new request starts over with what the button knew.
  const [seen, setSeen] = useState(request)
  if (seen !== request) {
    setSeen(request)
    setStep(0)
    setA(briefFrom(preset))
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    heading.current?.focus()
  }, [step])

  const toggleNeed = (n: (typeof BRIEF_NEEDS)[number]) =>
    setA((x) => {
      const needs = x.needs.includes(n) ? x.needs.filter((v) => v !== n) : [...x.needs, n]
      return { ...x, needs, tier: needs.includes("internet") ? x.tier : null }
    })

  const message = () => {
    const lines = [t("message.intro")]
    const needs = a.needs
      .map((n) => (n === "internet" && a.tier && a.tier !== "unsure" ? `${t(`needs.${n}`)} (${tb(`tiers.items.${a.tier}.name`)})` : t(`needs.${n}`)))
      .join(", ")
    lines.push(`• ${t("message.needs")}: ${needs}`)
    if (a.space && a.floors) lines.push(`• ${t("message.space")}: ${tb(`spaces.${a.space}`)}, ${t(`floors.${a.floors}`)}`)
    if (a.people) lines.push(`• ${t("message.people")}: ${t(`people.${a.people}`)}`)
    if (a.when) lines.push(`• ${t("message.when")}: ${t(`when.${a.when}`)}`)
    const name = a.company.trim()
    if (name) lines.push(`• ${t("message.company")}: ${name}`)
    return lines.join("\n")
  }

  const wa = isPlaceholder(company.whatsapp) ? null : company.whatsapp
  const canNext = briefStepComplete(step, a)

  return (
    <Dialog open={open} onOpenChange={brief.setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto rounded-[6px] border border-white/12 bg-[#09090c] p-0 text-zinc-200 ring-0 shadow-[0_40px_120px_-30px_rgb(167_139_250/0.45)] sm:max-w-2xl"
      >
        {/* Header: title, step counter, progress. */}
        <div className="border-b border-white/10 px-6 pt-6 pb-5 sm:px-8">
          <p className="font-mono text-xs text-[#a78bfa] tabular-nums" aria-hidden>
            {String(step + 1).padStart(2, "0")} <span className="text-zinc-400">/ {String(STEPS).padStart(2, "0")}</span>
          </p>
          <DialogTitle className="mt-2 text-2xl font-medium tracking-[-0.02em] text-white">{t("title")}</DialogTitle>
          <DialogDescription className="mt-1.5 text-sm text-zinc-400">{t("lead")}</DialogDescription>
          <div aria-hidden className="mt-5 grid grid-cols-4 gap-1.5">
            {Array.from({ length: STEPS }, (_, i) => (
              <span key={i} className={cn("h-0.5 rounded-full transition-colors duration-300", i <= step ? "bg-[#a78bfa]" : "bg-white/10")} />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">
            {t("stepStatus", { n: step + 1, total: STEPS, name: t(`steps.${step}`) })}
          </p>
        </div>

        <div className="px-6 py-6 sm:px-8">
          <h3 ref={heading} tabIndex={-1} className="text-lg font-medium text-white outline-none">
            {t(`questions.${step}`)}
          </h3>

          {step === 0 && (
            <>
              <Tiles>
                {BRIEF_NEEDS.map((n) => (
                  <Tile key={n} type="checkbox" name="needs" checked={a.needs.includes(n)} onChange={() => toggleNeed(n)} label={t(`needs.${n}`)} hint={t(`needsHint.${n}`, { max: business.maxLinkGbps, ...business.internalNetworkGbps })} />
                ))}
              </Tiles>
              {a.needs.includes("internet") && (
                <fieldset className="mt-6">
                  <legend className="text-sm text-zinc-400">{t("tierQuestion")}</legend>
                  <Tiles cols={2}>
                    {[...INTERNET_TIERS.map((x) => x.id).reverse(), "unsure" as const].map((id) => (
                      <Tile
                        key={id}
                        type="radio"
                        name="tier"
                        checked={a.tier === id}
                        onChange={() => setA((x) => ({ ...x, tier: id }))}
                        label={id === "unsure" ? t("tierUnsure") : tb(`tiers.items.${id}.name`)}
                      />
                    ))}
                  </Tiles>
                </fieldset>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Tiles cols={2}>
                {BRIEF_SPACES.map((s) => (
                  <Tile key={s} type="radio" name="space" checked={a.space === s} onChange={() => setA((x) => ({ ...x, space: s }))} label={tb(`spaces.${s}`)} />
                ))}
              </Tiles>
              <fieldset className="mt-6">
                <legend className="text-sm text-zinc-400">{t("floorsQuestion")}</legend>
                <Tiles cols={4}>
                  {BRIEF_FLOORS.map((f) => (
                    <Tile key={f} type="radio" name="floors" checked={a.floors === f} onChange={() => setA((x) => ({ ...x, floors: f }))} label={t(`floors.${f}`)} />
                  ))}
                </Tiles>
              </fieldset>
            </>
          )}

          {step === 2 && (
            <>
              <Tiles cols={4}>
                {BRIEF_PEOPLE.map((p) => (
                  <Tile key={p} type="radio" name="people" checked={a.people === p} onChange={() => setA((x) => ({ ...x, people: p }))} label={t(`people.${p}`)} />
                ))}
              </Tiles>
              <fieldset className="mt-6">
                <legend className="text-sm text-zinc-400">{t("whenQuestion")}</legend>
                <Tiles cols={2}>
                  {BRIEF_WHEN.map((w) => (
                    <Tile key={w} type="radio" name="when" checked={a.when === w} onChange={() => setA((x) => ({ ...x, when: w }))} label={t(`when.${w}`)} />
                  ))}
                </Tiles>
              </fieldset>
            </>
          )}

          {step === 3 && (
            <>
              <label className="mt-5 block">
                <span className="text-sm text-zinc-400">{t("companyLabel")}</span>
                <input
                  value={a.company}
                  maxLength={80}
                  autoComplete="organization"
                  onChange={(e) => setA((x) => ({ ...x, company: e.target.value }))}
                  className="mt-2 block min-h-11 w-full rounded-[4px] border border-white/15 bg-white/[0.03] px-3 text-white outline-none placeholder:text-zinc-500 focus-visible:border-[#a78bfa] focus-visible:ring-2 focus-visible:ring-[#a78bfa]/40"
                />
              </label>
              <div className="mt-5 rounded-[4px] border border-white/10 bg-white/[0.02] p-4">
                <p className="text-xs text-zinc-400">{t("preview")}</p>
                <pre className="mt-2 font-sans text-sm leading-relaxed whitespace-pre-wrap text-zinc-100">{message()}</pre>
              </div>
              <p className="mt-3 text-xs text-zinc-400">{t("privacy")}</p>
            </>
          )}
        </div>

        {/* Footer: back / next, or send. */}
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-6 py-4 sm:px-8">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-[4px] px-3 text-sm text-zinc-300 hover:text-white focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:outline-none"
            >
              <ArrowLeft className="size-4" aria-hidden />
              {t("back")}
            </button>
          ) : (
            <span />
          )}
          {step < STEPS - 1 ? (
            <button
              type="button"
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-[4px] bg-white px-5 text-sm font-medium text-black transition-opacity hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090c] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("next")}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          ) : wa ? (
            <a
              href={whatsappHref(wa, message())}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                track("whatsapp_clicked", { context: context ?? "business_brief", brief: true, needs: a.needs, space: a.space })
                brief.setOpen(false)
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-[4px] bg-white px-5 text-sm font-medium text-black hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:ring-offset-2 focus-visible:ring-offset-[#09090c] focus-visible:outline-none"
            >
              <MessageCircle className="size-4 text-emerald-600" aria-hidden />
              {t("send")}
              <ArrowUpRight className="size-4 opacity-60" aria-hidden />
            </a>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-zinc-400">
              {t("send")}
              {isPlaceholder(company.whatsapp) && <PlaceholderChip keyName={company.whatsapp.key} />}
            </span>
          )}
        </div>

        <DialogClose className="absolute top-4 right-4 inline-flex size-9 items-center justify-center rounded-[4px] text-zinc-400 hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-[#a78bfa] focus-visible:outline-none">
          <XIcon className="size-4" aria-hidden />
          <span className="sr-only">{t("close")}</span>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}

function Tiles({ cols = 1, children }: { cols?: 1 | 2 | 4; children: React.ReactNode }) {
  return (
    <div className={cn("mt-4 grid gap-2", cols === 2 && "sm:grid-cols-2", cols === 4 && "grid-cols-2 sm:grid-cols-4")}>{children}</div>
  )
}

/** A native radio/checkbox styled as a selectable tile. */
function Tile({
  type,
  name,
  checked,
  onChange,
  label,
  hint,
}: {
  type: "radio" | "checkbox"
  name: string
  checked: boolean
  onChange: () => void
  label: string
  hint?: string
}) {
  return (
    <label
      className={cn(
        "group relative flex min-h-12 cursor-pointer items-center gap-3 rounded-[4px] border px-4 py-3 transition-colors",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#a78bfa]",
        checked ? "border-[#a78bfa]/70 bg-[#a78bfa]/10 text-white" : "border-white/12 text-zinc-200 hover:border-white/30 hover:bg-white/[0.03]"
      )}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center border transition-colors",
          type === "radio" ? "rounded-full" : "rounded-[3px]",
          checked ? "border-[#a78bfa] bg-[#a78bfa] text-black" : "border-white/30"
        )}
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 text-xs text-zinc-400">{hint}</span>}
      </span>
    </label>
  )
}
