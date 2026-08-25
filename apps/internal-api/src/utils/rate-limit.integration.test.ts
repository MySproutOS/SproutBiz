import { v7 } from "uuid"
import { afterAll, describe, expect, it } from "vitest"
import { closeRateLimiter, consume } from "./rate-limit"

afterAll(async () => {
  await closeRateLimiter()
})

describe("fixed-window rate limiting", () => {
  it("allows up to the limit and then refuses", async () => {
    const key = `test:${v7()}`
    const tier = { limit: 3, windowSec: 60 }

    const first = await consume(key, tier)
    expect(first.allowed).toBe(true)
    expect(first.remaining).toBe(2)

    expect((await consume(key, tier)).remaining).toBe(1)
    expect((await consume(key, tier)).remaining).toBe(0)

    const overLimit = await consume(key, tier)
    expect(overLimit.allowed).toBe(false)
    expect(overLimit.remaining).toBe(0)
  })

  it("budgets each principal separately", async () => {
    const tier = { limit: 2, windowSec: 60 }
    const a = `test:${v7()}`
    const b = `test:${v7()}`

    await consume(a, tier)
    await consume(a, tier)
    expect((await consume(a, tier)).allowed).toBe(false)

    // b has spent nothing, so a's exhausted budget must not affect it.
    expect((await consume(b, tier)).allowed).toBe(true)
  })

  it("reports a reset time inside the current window", async () => {
    const { resetSec } = await consume(`test:${v7()}`, { limit: 1, windowSec: 60 })
    const now = Math.floor(Date.now() / 1000)
    expect(resetSec).toBeGreaterThan(now)
    expect(resetSec).toBeLessThanOrEqual(now + 60)
  })
})
