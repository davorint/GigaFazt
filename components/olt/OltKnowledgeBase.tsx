"use client"

import { useId, useMemo, useState, type ReactNode } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { SectionNav } from "@/components/mikrotik/SectionNav"
import { SelectField } from "@/components/mikrotik/SelectField"
import { BoardCompare } from "./BoardCompare"
import { ModifiedChassis } from "./ModifiedChassis"
import { OltCommands } from "./OltCommands"
import { OltFans } from "./OltFans"
import { OpticBudget } from "./OpticBudget"
import { Src } from "./Src"
import { OltBuilder } from "./OltBuilder"
import { OltOnts } from "./OltOnts"
import { OltPower } from "./OltPower"
import { OltSoftware } from "./OltSoftware"
import { OltTrouble } from "./OltTrouble"
import { OpticModules } from "./OpticModules"
import { BOARD_KINDS, BOARDS, CHASSIS, OPTICS, SOURCES, chassisName, type Board, type BoardKind, type Chassis, type Fact, type Family } from "@/lib/olt-kb"

const SECTIONS = ["chassis", "builder", "boards", "power", "fans", "optics", "onts", "compat", "modified", "software", "buying", "trouble", "commands", "sources"] as const
const ANCHOR: Record<(typeof SECTIONS)[number], string> = {
  chassis: "chasis",
  builder: "armar",
  boards: "tarjetas",
  power: "energia",
  fans: "ventiladores",
  optics: "opticas",
  onts: "onts",
  compat: "compatibilidad",
  modified: "modificados",
  software: "software",
  buying: "compra",
  trouble: "fallas",
  commands: "comandos",
  sources: "fuentes",
}

function Value({ fact }: { fact?: Fact }) {
  const t = useTranslations("olt")
  if (!fact) return <span className="text-zinc-400">{t("missing")}</span>
  return (
    <>
      {fact.v}
      <Src id={fact.src} />
    </>
  )
}

function Section({ id, name, title, lead, children }: { id: string; name: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section id={id} data-section={name} className="scroll-mt-16 py-10 sm:py-14">
      <div className="mb-6 max-w-3xl">
        <h2 className="text-2xl font-normal tracking-tight text-foreground sm:text-3xl">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400 sm:text-base">{lead}</p>
      </div>
      {children}
    </section>
  )
}

const ROWS = ["alias", "height", "dimensions", "weight", "backplane", "serviceSlots", "controlSlots", "controlBoards", "uplinkSlots", "powerSlots", "powerBoards", "power", "maxPower", "fans", "gpon", "tenG", "ge", "switching", "temperature", "minSoftware"] as const

function ChassisTable({ family }: { family: Family }) {
  const t = useTranslations("olt.chassis")
  const list = CHASSIS.filter((c) => c.family === family)
  const cell = (c: Chassis, row: (typeof ROWS)[number]) => {
    if (row === "controlBoards" || row === "powerBoards") return <span className="font-mono text-xs">{c[row].join(", ")}</span>
    return <Value fact={c[row]} />
  }
  return (
    <div className="grid gap-2">
      <h3 className="text-base font-medium text-foreground">{t(`families.${family}`)}</h3>
      <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={`${t("caption")}: ${t(`families.${family}`)}`}>
        <table className="w-full min-w-[56rem] text-left text-sm">
          <caption className="sr-only">{`${t("caption")}: ${t(`families.${family}`)}`}</caption>
          <thead>
            <tr className="border-b border-white/10">
              <th scope="col" className="sticky left-0 bg-background px-3 py-2.5 text-xs font-normal text-zinc-400">
                <span className="sr-only">{t("caption")}</span>
              </th>
              {list.map((c) => (
                <th key={c.id} scope="col" className="px-3 py-2.5 font-mono text-sm font-medium whitespace-nowrap text-foreground">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.filter((row) => list.some((c) => (row === "controlBoards" || row === "powerBoards" ? c[row].length > 0 : c[row] !== undefined))).map((row) => (
              <tr key={row} className="border-t border-white/5 align-top">
                <th scope="row" className="sticky left-0 w-48 bg-background px-3 py-2.5 text-xs font-normal text-zinc-400">
                  {t(`rows.${row}`)}
                </th>
                {list.map((c) => (
                  <td key={c.id} className="px-3 py-2.5 leading-snug text-zinc-200">
                    {cell(c, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BoardCard({ b }: { b: Board }) {
  const t = useTranslations("olt.boards")
  const row = (label: string, node: ReactNode) => (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="text-sm leading-snug text-zinc-200">{node}</dd>
    </div>
  )
  return (
    <li className="surface grid content-start gap-3 rounded-xl p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-mono text-base font-medium text-foreground">{b.code}</h3>
        <span className="text-xs text-zinc-400">{t(`kinds.${b.kind}`)}</span>
      </div>
      <dl className="grid gap-1.5">
        {row(t("fields.ports"), <Value fact={b.ports} />)}
        {b.power && row(t("fields.power"), <Value fact={b.power} />)}
        {row(t("fields.chassis"), b.chassis.map(chassisName).join(", "))}
        {b.controls &&
          row(
            t("fields.controls"),
            <>
              {b.controls.v.join(", ")}
              <Src id={b.controls.src} />
            </>
          )}
        {b.minVersion && row(t("fields.minVersion"), <Value fact={b.minVersion} />)}
        {b.lifecycle &&
          row(
            t("fields.lifecycle"),
            <span className="text-amber-200">
              {t(`lifecycle.${b.lifecycle.v}`)}
              <Src id={b.lifecycle.src} />
            </span>
          )}
        {b.replacedBy &&
          row(
            t("fields.replacedBy"),
            <span className="font-mono text-xs">
              {b.replacedBy.v.join(", ")}
              <Src id={b.replacedBy.src} />
            </span>
          )}
        {b.detail && row(t("fields.detail"), <Value fact={b.detail} />)}
      </dl>
    </li>
  )
}

function Boards() {
  const t = useTranslations("olt.boards")
  const id = useId()
  const [query, setQuery] = useState("")
  const [family, setFamily] = useState<Family | "all">("all")
  const [kind, setKind] = useState<BoardKind | "all">("all")
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return BOARDS.filter((b) => (family === "all" || b.family === family) && (kind === "all" || b.kind === kind))
      .filter((b) => !q || [b.code, b.ports.v, b.detail?.v ?? "", ...b.chassis.map(chassisName)].some((x) => x.toLowerCase().includes(q)))
  }, [query, family, kind])
  return (
    <div className="grid gap-5">
      <div className="grid items-start gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <div className="grid content-start gap-1.5">
          <label htmlFor={id} className="font-mono text-xs text-zinc-300">
            {t("search")}
          </label>
          <Input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} spellCheck={false} autoComplete="off" aria-describedby={`${id}-hint`} className="h-10 bg-white/[0.03] font-mono text-base md:text-sm" />
          <p id={`${id}-hint`} className="text-xs text-zinc-400">
            {t("searchHint")}
          </p>
        </div>
        <SelectField label={t("family")} value={family} onChange={(v) => setFamily(v as Family | "all")}>
          {(["all", "ma5600", "ma5800"] as const).map((f) => (
            <option key={f} value={f}>
              {t(`families.${f}`)}
            </option>
          ))}
        </SelectField>
        <SelectField label={t("kind")} value={kind} onChange={(v) => setKind(v as BoardKind | "all")}>
          {(["all", ...BOARD_KINDS] as const).map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <p className="text-sm text-zinc-300" aria-live="polite">
        {t("count", { count: list.length })}
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-400">{t("none")}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((b) => (
            <BoardCard key={b.code} b={b} />
          ))}
        </ul>
      )}
    </div>
  )
}

/** GPON boards of the MA5600T family against each control board (Huawei's tables 3-4 and 3-5). */
const COMPAT_CONTROLS = ["SCUB", "SCUL", "SCUN", "SCUH", "SCUV", "MCUD", "MCUD1", "MCUE"]

function CompatTable() {
  const t = useTranslations("olt.compat")
  const rows = BOARDS.filter((b) => b.family === "ma5600" && (b.kind === "gpon" || b.kind === "tenG" || b.kind === "uplink") && b.controls)
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("caption")}>
      <table className="w-full min-w-[44rem] text-left text-sm">
        <caption className="sr-only">{t("caption")}</caption>
        <thead className="text-xs text-zinc-400">
          <tr className="border-b border-white/10">
            <th scope="col" className="px-3 py-2.5 font-normal">
              {t("colBoard")}
            </th>
            {COMPAT_CONTROLS.map((c) => (
              <th key={c} scope="col" className="px-2 py-2.5 text-center font-mono font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => {
            const has = (c: string) => (b.controls?.v ?? []).some((x) => x === c || x.startsWith(`${c} `))
            return (
              <tr key={b.code} className="border-t border-white/5">
                <th scope="row" className="px-3 py-2 font-mono text-sm font-normal text-zinc-100">
                  {b.code}
                </th>
                {COMPAT_CONTROLS.map((c) => (
                  <td key={c} className={`px-2 py-2 text-center ${has(c) ? "text-emerald-300" : "text-zinc-400"}`}>
                    {has(c) ? t("yes") : t("no")}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 text-sm leading-relaxed text-zinc-300">
      {items.map((x, k) => (
        <li key={k} className="flex gap-2">
          <span aria-hidden className="text-zinc-600">
            ·
          </span>
          {x}
        </li>
      ))}
    </ul>
  )
}

export function OltKnowledgeBase() {
  const t = useTranslations("olt")
  const nav = SECTIONS.map((k) => ({ id: ANCHOR[k], label: t(`intro.jump.${k}`) }))
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
      <section id="inicio" data-section="olt-intro" className="pt-10 pb-4 sm:pt-16">
        <div className="flex flex-wrap items-center gap-3">
          <p className="eyebrow">{t("intro.eyebrow")}</p>
          <span className="rounded border border-amber-400/30 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.12em] text-amber-300 uppercase">{t("intro.private")}</span>
        </div>
        <h1 className="mt-4 text-4xl font-light tracking-tight text-foreground sm:text-6xl">{t("intro.title")}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-300 sm:text-lg">{t("intro.lead")}</p>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-zinc-400">
          {t.rich("intro.legend", {
            huawei: () => <span className="rounded border border-cyan-400/30 px-1 font-mono text-[11px] text-cyan-300">{t("intro.huawei")}</span>,
            reseller: () => <span className="rounded border border-amber-400/30 px-1 font-mono text-[11px] text-amber-300">{t("intro.reseller")}</span>,
            standard: () => <span className="rounded border border-violet-400/40 px-1 font-mono text-[11px] text-violet-300">{t("intro.standard")}</span>,
          })}
        </p>
        <p className="mt-3 text-sm text-zinc-400">
          {t("intro.links")}{" "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
          <a href="/mikrotik" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t("intro.mikrotik")}
          </a>
          {" · "}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- another internal page: a full load (each page keeps its own state; proxy.ts rewrites it) */}
          <a href="/calculadora" className="text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
            {t("intro.calc")}
          </a>
        </p>
      </section>

      <SectionNav label={t("intro.navLabel")} items={nav} />

      <Section id={ANCHOR.chassis} name="olt-chassis" title={t("chassis.title")} lead={t("chassis.lead")}>
        <div className="grid gap-8">
          <ChassisTable family="ma5600" />
          <ChassisTable family="ma5800" />
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("chassis.note")}</p>
        </div>
      </Section>

      <Section id={ANCHOR.builder} name="olt-builder" title={t("builder.title")} lead={t("builder.lead")}>
        <OltBuilder />
      </Section>

      <Section id={ANCHOR.boards} name="olt-boards" title={t("boards.title")} lead={t("boards.lead")}>
        <div className="grid gap-8">
          <div className="grid gap-3">
            <h3 className="text-base font-medium text-foreground">{t("boards.compareTitle")}</h3>
            <BoardCompare />
          </div>
          <Boards />
        </div>
      </Section>

      <Section id={ANCHOR.power} name="olt-power" title={t("power.title")} lead={t("power.lead")}>
        <OltPower />
      </Section>

      <Section id={ANCHOR.fans} name="olt-fans" title={t("fans.title")} lead={t("fans.lead")}>
        <OltFans />
      </Section>

      <Section id={ANCHOR.optics} name="olt-optics" title={t("optics.title")} lead={t("optics.lead")}>
        <div className="grid gap-3">
          <div className="overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label={t("optics.caption")}>
            <table className="w-full min-w-[48rem] text-left text-sm">
              <caption className="sr-only">{t("optics.caption")}</caption>
              <thead className="text-xs text-zinc-400">
                <tr className="border-b border-white/10">
                  {(["class", "budget", "tx", "sensitivity", "split", "use"] as const).map((k) => (
                    <th key={k} scope="col" className="px-3 py-2.5 font-normal">
                      {t(`optics.cols.${k}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {OPTICS.map((o) => (
                  <tr key={o.id} className="border-t border-white/5 align-top text-zinc-200">
                    <th scope="row" className="px-3 py-2.5 font-mono font-medium text-foreground">
                      {o.id}
                    </th>
                    <td className="px-3 py-2.5">
                      <Value fact={o.budget} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Value fact={o.tx} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Value fact={o.sensitivity} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Value fact={o.split} />
                    </td>
                    <td className="px-3 py-2.5 text-zinc-400">{t(`optics.use.${o.use}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("optics.note")}</p>
          <OpticBudget />
          <OpticModules />
        </div>
      </Section>

      <Section id={ANCHOR.onts} name="olt-onts" title={t("onts.title")} lead={t("onts.lead")}>
        <OltOnts />
      </Section>

      <Section id={ANCHOR.compat} name="olt-compat" title={t("compat.title")} lead={t("compat.lead")}>
        <div className="grid gap-6">
          <CompatTable />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid content-start gap-3">
              <h3 className="text-base font-medium text-foreground">{t("compat.chainsTitle")}</h3>
              <Bullets items={t.raw("compat.chains") as string[]} />
            </div>
            <div className="grid content-start gap-3">
              <h3 className="text-base font-medium text-foreground">{t("compat.familyTitle")}</h3>
              <Bullets items={t.raw("compat.family") as string[]} />
            </div>
          </div>
          <p className="max-w-3xl text-xs leading-snug text-zinc-400">{t("compat.note")}</p>
        </div>
      </Section>

      <Section id={ANCHOR.modified} name="olt-modified" title={t("modified.title")} lead={t("modified.lead")}>
        <ModifiedChassis />
      </Section>

      <Section id={ANCHOR.software} name="olt-software" title={t("software.title")} lead={t("software.lead")}>
        <OltSoftware />
      </Section>

      <Section id={ANCHOR.buying} name="olt-buying" title={t("buying.title")} lead={t("buying.lead")}>
        <div className="grid gap-4 lg:grid-cols-2">
          {(["test", "software", "hardware", "upgrade"] as const).map((g) => (
            <div key={g} className="surface grid content-start gap-3 rounded-xl p-5">
              <h3 className="text-base font-medium text-foreground">{t(`buying.groups.${g}.title`)}</h3>
              <Bullets items={t.raw(`buying.groups.${g}.items`) as string[]} />
            </div>
          ))}
        </div>
      </Section>

      <Section id={ANCHOR.trouble} name="olt-trouble" title={t("trouble.title")} lead={t("trouble.lead")}>
        <OltTrouble />
      </Section>

      <Section id={ANCHOR.commands} name="olt-commands" title={t("commands.title")} lead={t("commands.lead")}>
        <OltCommands />
      </Section>

      <Section id={ANCHOR.sources} name="olt-sources" title={t("sources.title")} lead={t("sources.lead")}>
        <ul className="grid gap-3">
          {SOURCES.map((s) => (
            <li key={s.id} id={`fuente-${s.id}`} className="scroll-mt-20 grid gap-1 rounded-xl border border-white/10 p-4">
              <span className={`font-mono text-xs ${{ huawei: "text-cyan-300", reseller: "text-amber-300", standard: "text-violet-300" }[s.kind]}`}>
                {t(`sources.kind.${s.kind}`)}
                {s.date ? ` · ${s.date}` : ""}
              </span>
              <a href={s.url} rel="noreferrer noopener" target="_blank" className="text-sm break-words text-zinc-100 underline decoration-white/30 underline-offset-4 hover:decoration-white">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </main>
  )
}
