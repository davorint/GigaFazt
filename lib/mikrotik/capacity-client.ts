/**
 * Talks to the capacity worker. Each kind of request keeps only the latest
 * one: an older simulation that comes back after a newer request is dropped.
 * Without workers (or if the worker fails to load) it runs on the page,
 * after a tick so the UI can show it's busy.
 */

import { simulateCapacity, size, type CapacityInput, type CapacityResult, type Sizing } from "./capacity"

export type CapacityRequest =
  | { id: number; kind: "simulate"; input: CapacityInput }
  | { id: number; kind: "size"; input: Omit<CapacityInput, "parentMbps">; target: number }

export type CapacityResponse =
  | { id: number; kind: "simulate"; result: CapacityResult }
  | { id: number; kind: "size"; result: Sizing }
  | { id: number; kind: "progress"; done: number }

/** Served from /public; built before dev and build. */
export const WORKER_URL = "/capacity-worker.js"

type Handlers = {
  onResult: (r: CapacityResult) => void
  onSizing: (r: Sizing) => void
  onProgress: (done: number) => void
}

export class CapacityClient {
  private worker: Worker | null = null
  private failed = false
  private seq = 0
  private latest = { simulate: 0, size: 0 }
  private lastSimulate: CapacityInput | null = null

  constructor(private readonly handlers: Handlers) {
    if (typeof Worker === "undefined") return
    try {
      // Prebuilt by scripts/build-capacity-worker.mjs (Turbopack doesn't bundle workers).
      this.worker = new Worker(WORKER_URL, { type: "module" })
      this.worker.onmessage = (e: MessageEvent<CapacityResponse>) => this.receive(e.data)
      this.worker.onerror = () => this.fallBack()
    } catch {
      this.worker = null
    }
  }

  private receive(res: CapacityResponse) {
    if (res.kind === "simulate") {
      if (res.id === this.latest.simulate) this.handlers.onResult(res.result)
    } else if (res.id === this.latest.size) {
      if (res.kind === "size") this.handlers.onSizing(res.result)
      else this.handlers.onProgress(res.done)
    }
  }

  /** The worker couldn't start: rerun the last simulation on the page. */
  private fallBack() {
    this.worker?.terminate()
    this.worker = null
    this.failed = true
    if (this.lastSimulate) this.simulate(this.lastSimulate)
  }

  simulate(input: CapacityInput) {
    const id = ++this.seq
    this.latest.simulate = id
    this.lastSimulate = input
    if (this.worker) this.worker.postMessage({ id, kind: "simulate", input } satisfies CapacityRequest)
    else window.setTimeout(() => this.receive({ id, kind: "simulate", result: simulateCapacity(input) }), 0)
  }

  size(input: Omit<CapacityInput, "parentMbps">, target: number) {
    const id = ++this.seq
    this.latest.size = id
    if (this.worker) this.worker.postMessage({ id, kind: "size", input, target } satisfies CapacityRequest)
    else
      window.setTimeout(() => {
        const result = size(input, target)
        this.receive({ id, kind: "size", result })
      }, 30)
  }

  get offMainThread() {
    return this.worker !== null && !this.failed
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
  }
}
