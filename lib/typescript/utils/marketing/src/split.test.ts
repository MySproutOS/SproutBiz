import { describe, expect, it } from "vitest"
import { PLATFORMS, measurementDeadline, meetsViewMinimum, weightedViews } from "./platforms"
import { type SplitEntry, payoutFeeCents, splitPool } from "./split"

function entries(...weights: number[]): SplitEntry[] {
  return weights.map((weight, i) => ({
    videoId: `video-${i}`,
    userId: `user-${i}`,
    weightedViews: weight,
  }))
}

describe("weightedViews", () => {
  it("divides TikTok by three and leaves the others alone", () => {
    expect(weightedViews("tiktok", 5_000)).toBe(1_666)
    expect(weightedViews("youtube_short", 5_000)).toBe(5_000)
    expect(weightedViews("instagram_reel", 5_000)).toBe(5_000)
    expect(weightedViews("instagram_post", 5_000)).toBe(5_000)
  })
})

describe("meetsViewMinimum", () => {
  it("checks the floor against raw views, not weighted ones", () => {
    // 4,499 raw TikTok views weight to 1,499 -- above the 2,000 floor only if you forget
    // which number the floor applies to. It must not qualify.
    expect(meetsViewMinimum("tiktok", 4_499)).toBe(false)
    expect(meetsViewMinimum("tiktok", 4_500)).toBe(true)
    expect(meetsViewMinimum("youtube_short", 1_999)).toBe(false)
    expect(meetsViewMinimum("youtube_short", 2_000)).toBe(true)
    expect(PLATFORMS.tiktok.minViews).toBe(4_500)
  })
})

describe("measurementDeadline", () => {
  it("closes the window 30 days after the video was created", () => {
    expect(measurementDeadline(new Date("2026-01-20T14:30:00Z")).toISOString()).toBe(
      "2026-02-19T14:30:00.000Z",
    )
  })

  it("carries over into the next month across a short February", () => {
    expect(measurementDeadline(new Date("2026-02-10T00:00:00Z")).toISOString()).toBe(
      "2026-03-12T00:00:00.000Z",
    )
  })
})

describe("payoutFeeCents", () => {
  it("is zero for a zero payout and never exceeds the payout", () => {
    expect(payoutFeeCents(0)).toBe(0)
    expect(payoutFeeCents(10)).toBe(10)
  })

  it("takes 0.25% plus a flat 25c", () => {
    expect(payoutFeeCents(100_000)).toBe(250 + 25)
  })
})

describe("splitPool", () => {
  it("splits in proportion to weighted views", () => {
    const shares = splitPool(100_000, entries(3_000, 1_000))
    expect(shares.map((s) => s.grossUsdCents)).toEqual([75_000, 25_000])
    expect(shares.map((s) => s.shareBp)).toEqual([7_500, 2_500])
  })

  it("hands out exactly the pool, never a cent more, on an indivisible split", () => {
    // 100 / 3 floors to 33 each, leaving 1c that has to go somewhere.
    const shares = splitPool(100, entries(1, 1, 1))
    expect(shares.reduce((sum, s) => sum + s.grossUsdCents, 0)).toBe(100)
  })

  it("keeps the sum equal to the pool across many awkward splits", () => {
    for (const pool of [1, 7, 99, 100, 1_001, 123_457]) {
      for (const weights of [
        [1, 1, 1],
        [7, 11, 13],
        [1, 999_999],
        [5, 5, 5, 5, 5, 5, 5],
      ]) {
        const total = splitPool(pool, entries(...weights)).reduce(
          (sum, s) => sum + s.grossUsdCents,
          0,
        )
        expect(total).toBe(pool)
      }
    }
  })

  it("is deterministic when recalculated", () => {
    const input = entries(5, 5, 5)
    expect(splitPool(100, input)).toEqual(splitPool(100, input))
  })

  it("pays nobody when the pool is empty or nothing qualifies", () => {
    for (const shares of [splitPool(0, entries(10, 20)), splitPool(10_000, entries(0, 0))]) {
      expect(shares.every((s) => s.grossUsdCents === 0 && s.netUsdCents === 0)).toBe(true)
    }
  })

  it("still returns a row for an entry with no weighted views", () => {
    const shares = splitPool(10_000, entries(100, 0))
    expect(shares).toHaveLength(2)
    expect(shares[1].grossUsdCents).toBe(0)
    expect(shares[0].grossUsdCents).toBe(10_000)
  })

  it("takes the Stripe fee out of the creator's share, not out of the business", () => {
    const [share] = splitPool(100_000, entries(1))
    expect(share.grossUsdCents).toBe(100_000)
    expect(share.netUsdCents).toBe(100_000 - share.feeUsdCents)
    expect(share.feeUsdCents).toBeGreaterThan(0)
  })
})
