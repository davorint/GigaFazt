import { describe, expect, it } from "vitest"
import { business, transferSeconds } from "./business"

describe("internal network transfer times", () => {
  it("moves the sample file in 80 s at 10 Gbps and 2 s at 400 Gbps", () => {
    expect(transferSeconds(business.sampleFileGb, business.internalNetworkGbps.from)).toBe(80)
    expect(transferSeconds(business.sampleFileGb, business.internalNetworkGbps.to)).toBe(2)
  })
})
