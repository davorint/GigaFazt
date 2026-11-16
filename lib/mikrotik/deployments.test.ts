import { describe, expect, it } from "vitest"
import { averageOf, exportFile, homesPerPortOf, parseFile, portsOf, summarize } from "./deployments"
import { decodeDeployment, decodeState, DEFAULT_CAPACITY, deploymentFields, encodeDeployment, encodeState, initialState, type DeploymentFields } from "./state"

const example = (): DeploymentFields => deploymentFields(initialState())
const running = (): DeploymentFields => ({
  ...example(),
  deployment: "Pedregal",
  status: "existing",
  capacity: { ...DEFAULT_CAPACITY, portsInUse: 12, measuredDownMbps: 1860, measuredUpMbps: 150 },
})

describe("what the model takes from a deployment", () => {
  it("one that already runs uses its ports in use and what was measured", () => {
    const f = running()
    // 600 clients on 12 ports.
    expect(homesPerPortOf(f)).toBe(50)
    expect(portsOf(f)).toBe(12)
    expect(averageOf(f, "down")).toEqual({ mbps: 3.1, measured: true })
    expect(averageOf(f, "up")).toEqual({ mbps: 0.25, measured: true })
  })
  it("a planned one uses the inputs, even with measured values kept", () => {
    const f = { ...running(), status: "planned" as const }
    expect(homesPerPortOf(f)).toBe(32)
    expect(portsOf(f)).toBe(19)
    expect(averageOf(f, "down")).toEqual({ mbps: 3.4, measured: false })
  })
  it("not measured: the input average", () => {
    const f = { ...running(), capacity: { ...running().capacity, measuredDownMbps: null } }
    expect(averageOf(f, "down")).toEqual({ mbps: 3.4, measured: false })
    expect(averageOf(f, "up").measured).toBe(true)
  })
})

describe("comparison summary", () => {
  it("averages against the internet links and the OLT uplink", () => {
    const s = summarize(example())
    expect(s).toMatchObject({ clients: 600, offeredMbps: 2040, internetMbps: 3000, links: 3, ports: 19, maxPorts: 32, problems: 0 })
    expect(s.oltLoad).toBeCloseTo(0.204)
    const measured = summarize(running())
    expect(measured).toMatchObject({ offeredMbps: 1860, measured: true, ports: 12 })
  })
  it("counts the problems and handles one uplink and no PON", () => {
    const bad = { ...example(), capacity: { ...DEFAULT_CAPACITY, pon: "xgspon" as const } }
    expect(summarize(bad).problems).toBeGreaterThan(0)
    const single = summarize({ ...example(), capacity: { ...DEFAULT_CAPACITY, internet: "single", parentMbps: 10_000, pon: "none" } })
    expect(single).toMatchObject({ internetMbps: 10_000, links: null, ports: 0, maxPorts: null, oltLoad: null })
  })
})

describe("saved deployments", () => {
  it("read back exactly", () => {
    const f = running()
    expect(decodeDeployment(encodeDeployment(f))).toEqual(f)
    expect(decodeDeployment(encodeDeployment(example()))).toEqual(example())
  })
  it("reject text that isn't a deployment", () => {
    expect(decodeDeployment("")).toBeNull()
    expect(decodeDeployment("h=nope")).toBeNull()
    // Capacity without links is incomplete.
    expect(decodeDeployment(encodeDeployment(example()).replace(/&w=[^&]*/, ""))).toBeNull()
  })
  it("the share link carries status, ports in use and measured traffic; older links read them as not set", () => {
    const s = { ...initialState(), ...running() }
    expect(decodeState(encodeState(s))).toEqual(s)
    const old = decodeState("#d=100,500,75,16,0&h=10000,down,3.4,0.21,0.5,5,50,gpon,32,200,200,200&o=0.92,links,ma5683t,10000")
    expect(old?.capacity).toMatchObject({ oltModel: "ma5683t", portsInUse: null, measuredDownMbps: null, measuredUpMbps: null })
    expect(old?.status).toBe("planned")
  })
  it("backup file round trip; foreign files and broken entries are refused", () => {
    const list = [
      { id: "a", updatedAt: 1, data: encodeDeployment(running()) },
      { id: "b", updatedAt: 2, data: encodeDeployment(example()) },
    ]
    expect(parseFile(exportFile(list))).toEqual(list)
    const mixed = JSON.parse(exportFile(list))
    mixed.deployments.push({ id: "c", updatedAt: 3, data: "h=nope" }, { id: 4, data: "x" })
    expect(parseFile(JSON.stringify(mixed))?.map((d) => d.id)).toEqual(["a", "b"])
    expect(parseFile(JSON.stringify({ ...mixed, app: "otra" }))).toBeNull()
    expect(parseFile("not json")).toBeNull()
  })
})
