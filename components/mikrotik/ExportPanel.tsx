"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
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
  userManagerPlans,
  type Pair,
} from "@/lib/mikrotik/routeros"
import type { LabState } from "@/lib/mikrotik/state"
import { CodeBlock as Code } from "./CodeBlock"
import { SetupChecks } from "./SetupChecks"
import { TextField } from "./TextField"

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
      <SetupChecks />
      <div className="grid gap-4 sm:max-w-xl sm:grid-cols-2">
        <TextField label={t("name")} value={name ?? auto} onChange={setName} />
      </div>
      <Tabs defaultValue="simple" className="min-w-0 gap-5">
        <TabsList className="w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto sm:w-fit">
            {(["simple", "tree", "pcq", "ppp", "um"] as const).map((k) => (
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

        <TabsContent value="um" className="grid min-w-0 gap-4">
          <Code label={t("tabs.um")} code={userManagerPlans([{ name: n, pair: p }])} />
          <p className="text-sm text-zinc-400">{t("notes.um")}</p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
