import { describe, expect, it } from "vitest"
import { formatMinorUnits, isPayoutInterval, minimumPayoutMinorUnits } from "./minimums"

describe("minimumPayoutMinorUnits", () => {
  it("is one cent in the US, not one dollar", () => {
    // The whole reason this table exists: the obvious guess is wrong for the biggest market.
    expect(minimumPayoutMinorUnits("usd")).toBe(1)
    expect(minimumPayoutMinorUnits("USD")).toBe(1)
  })

  it("is one whole unit for sterling and the euro", () => {
    expect(minimumPayoutMinorUnits("gbp")).toBe(100)
    expect(minimumPayoutMinorUnits("eur")).toBe(100)
  })

  it("treats a zero-decimal currency's whole unit as its minor unit", () => {
    expect(minimumPayoutMinorUnits("jpy")).toBe(1)
  })

  it("falls back to one base unit for anything unlisted", () => {
    expect(minimumPayoutMinorUnits("sek")).toBe(100)
  })
})

describe("formatMinorUnits", () => {
  it("formats decimal currencies from minor units", () => {
    expect(formatMinorUnits(1, "usd")).toBe("$0.01")
    expect(formatMinorUnits(4962, "usd")).toBe("$49.62")
  })

  it("does not divide a zero-decimal currency by 100", () => {
    expect(formatMinorUnits(500, "jpy")).toBe("¥500")
  })
})

describe("isPayoutInterval", () => {
  it("accepts Stripe's schedule intervals and nothing else", () => {
    expect(isPayoutInterval("manual")).toBe(true)
    expect(isPayoutInterval("weekly")).toBe(true)
    expect(isPayoutInterval("yearly")).toBe(false)
  })
})
