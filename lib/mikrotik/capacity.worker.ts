/**
 * Runs the busiest-hour model off the main thread (hundreds or thousands of
 * clients, and the sizing solver that repeats it ~40 times).
 */

import { simulateCapacity, size } from "./capacity"
import type { CapacityRequest, CapacityResponse } from "./capacity-client"

// Typed as a plain message port: the DOM lib types `self` as a Window.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<CapacityRequest>) => void) | null
  postMessage: (message: CapacityResponse) => void
}

ctx.onmessage = (e) => {
  const req = e.data
  if (req.kind === "simulate") {
    ctx.postMessage({ id: req.id, kind: "simulate", result: simulateCapacity(req.input) })
    return
  }
  const result = size(req.input, req.target, (done) => ctx.postMessage({ id: req.id, kind: "progress", done }))
  ctx.postMessage({ id: req.id, kind: "size", result })
}
