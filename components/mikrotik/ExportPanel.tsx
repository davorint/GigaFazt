"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  hotspotProfile,
  pcqTypes,
  pppProfile,
  queueTree,
  radiusAttribute,
  rateLimit,
  rosRate,
  simpleQueue,
  type Pair,
} from "@/lib/mikrotik/routeros"
import type { LabState } from "@/lib/mikrotik/state"
import { CopyButton } from "./CopyButton"

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-xs text-zinc-300">{label}</span>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        className="h-10 bg-white/[0.03] font-mono text-base md:text-sm"
      />
    </label>
  )
}

function Code({ code, label }: { code: string; label: string }) {
  const t = useTranslations("mikrotik.export")
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs text-zinc-400">{label}</p>
        <CopyButton text={code} label={t("copy")} done={t("copied")} />
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-100 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* Wrap between parameters only, never inside a key=value. */}
        <code>
          {code.split("\n").map((line, i) => (
            <span key={i} className="block">
              {line.split(" ").map((token, j) => (
                <span key={j}>
                  {j > 0 && " "}
                  <span className="whitespace-nowrap">{token}</span>
                </span>
              ))}
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

export function ExportPanel({ state }: { state: LabState }) {
  const t = useTranslations("mikrotik.export")
  const p: Pair = { down: state.down, up: state.symmetric ? state.down : state.up }
  // Named after the plan speed (the most the client gets), else max-limit.
  const auto = `plan-${rosRate(state.planMbps ?? p.down.maxLimit)}`
  const [name, setName] = useState<string | null>(null)
  const [target, setTarget] = useState("10.0.0.2/32")
  const [parent, setParent] = useState("global")
  const [markDown, setMarkDown] = useState("cliente-down")
  const [markUp, setMarkUp] = useState("cliente-up")
  const n = (name ?? auto).trim() || auto

  return (
    <div className="surface grid min-w-0 gap-6 rounded-2xl p-5 sm:p-7 [&>*]:min-w-0">
      <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <TextField label={t("name")} value={name ?? auto} onChange={setName} />
      </div>
      <Tabs defaultValue="simple" className="min-w-0 gap-5">
        <TabsList className="w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto sm:w-fit">
            {(["simple", "tree", "pcq", "ppp"] as const).map((k) => (
              <TabsTrigger key={k} value={k} className="h-8 flex-none px-3">
                {t(`tabs.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>

        <TabsContent value="simple" className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
            <TextField label={t("target")} value={target} onChange={setTarget} />
          </div>
          <Code label={t("tabs.simple")} code={simpleQueue(p, { name: n, target })} />
          <p className="text-sm text-zinc-400">{t("notes.simple")}</p>
        </TabsContent>

        <TabsContent value="tree" className="grid min-w-0 gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label={t("parent")} value={parent} onChange={setParent} />
            <TextField label={t("markDown")} value={markDown} onChange={setMarkDown} />
            <TextField label={t("markUp")} value={markUp} onChange={setMarkUp} />
          </div>
          <Code label={t("tabs.tree")} code={queueTree(p, { name: n, parent, markDown, markUp })} />
          <p className="text-sm text-zinc-400">{t("notes.tree")}</p>
        </TabsContent>

        <TabsContent value="pcq" className="grid min-w-0 gap-4">
          <Code label={t("tabs.pcq")} code={pcqTypes(p, { name: n })} />
          <p className="text-sm text-zinc-400">{t("notes.pcq")}</p>
        </TabsContent>

        <TabsContent value="ppp" className="grid min-w-0 gap-5">
          <Code label={t("rateLimit")} code={rateLimit(p)} />
          <Code label="/ppp profile" code={pppProfile(p, { name: n })} />
          <Code label="/ip hotspot user profile" code={hotspotProfile(p, { name: n })} />
          <Code label="RADIUS" code={radiusAttribute(p)} />
          <p className="text-sm text-zinc-400">{t("notes.ppp")}</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
