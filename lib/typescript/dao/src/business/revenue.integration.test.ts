import { db } from "@template-nextjs/db"
import { v7 } from "uuid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { crudBusinessCostSnapshot } from "../businessCostSnapshot/crud"
import { crudBusinessRevenueSnapshot } from "../businessRevenueSnapshot/crud"
import { fetchBusinessRevenueSnapshot } from "../businessRevenueSnapshot/fetch"
import { crudForumRevenueDaily } from "../forumRevenueDaily/crud"
import { fetchForumRevenueDaily } from "../forumRevenueDaily/fetch"
import { crudBusiness } from "./crud"
import { fetchBusiness } from "./fetch"

const suffix = v7().slice(0, 8)
const ownerId = v7()
let syncedId: string
let selfReportedId: string

beforeAll(async () => {
  await db
    .insertInto("user")
    .values({ id: ownerId, username: `biz-${suffix}`, email: `biz-${suffix}@example.invalid` })
    .execute()

  syncedId = (
    await crudBusiness(db).create({
      ownerUserId: ownerId,
      name: "Synced Co",
      slug: `synced-${suffix}`,
      platform: "web",
    })
  ).id
  selfReportedId = (
    await crudBusiness(db).create({
      ownerUserId: ownerId,
      name: "Self Reported Co",
      slug: `self-${suffix}`,
      platform: "ios",
    })
  ).id
})

afterAll(async () => {
  await db.deleteFrom("business").where("ownerUserId", "=", ownerId).execute()
  await db.deleteFrom("user").where("id", "=", ownerId).execute()
  await db.destroy()
})

describe("revenue snapshots", () => {
  it("upserts a period rather than double-counting when a provider restates it", async () => {
    const period = { periodStart: "2026-07-01", periodEnd: "2026-07-31" }

    await crudBusinessRevenueSnapshot(db).upsert({
      businessId: syncedId,
      source: "stripe",
      ...period,
      usdNetCents: 10_000,
      netCents: 10_000,
      grossCents: 10_000,
    })
    // The same period arriving again with a refund applied must replace, not add.
    await crudBusinessRevenueSnapshot(db).upsert({
      businessId: syncedId,
      source: "stripe",
      ...period,
      usdNetCents: 7_500,
      netCents: 7_500,
      grossCents: 10_000,
      refundsCents: 2_500,
    })

    const periods = await fetchBusinessRevenueSnapshot(db).listForBusiness(syncedId)
    expect(periods).toHaveLength(1)
    expect(periods[0].usdNetCents).toBe(7_500)
  })

  it("returns money as a number, not the string the driver hands back", async () => {
    const periods = await fetchBusinessRevenueSnapshot(db).listForBusiness(syncedId)
    expect(typeof periods[0].usdNetCents).toBe("number")
  })
})

describe("business totals", () => {
  it("sums revenue and costs and flags self-reported figures", async () => {
    await crudBusinessCostSnapshot(db).upsert({
      businessId: syncedId,
      source: "stripe",
      category: "payments",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      usdAmountCents: 2_000,
      amountCents: 2_000,
    })
    await crudBusinessRevenueSnapshot(db).upsert({
      businessId: selfReportedId,
      source: "manual",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      usdNetCents: 999_999,
      netCents: 999_999,
    })

    const all = await fetchBusiness(db).listWithTotals()
    const synced = all.find((b) => b.id === syncedId)
    const selfReported = all.find((b) => b.id === selfReportedId)

    expect(synced?.revenueUsdCents).toBe(7_500)
    expect(synced?.costUsdCents).toBe(2_000)
    expect(synced?.netUsdCents).toBe(5_500)
    // Provider-synced figures are trustworthy...
    expect(synced?.verified).toBe(true)
    // ...an agent's own number is not, and must be distinguishable on the page.
    expect(selfReported?.verified).toBe(false)
  })
})

describe("forum rollup", () => {
  it("reports zeroes before anything has been computed", async () => {
    await db.deleteFrom("forumRevenueDaily").execute()
    const summary = await fetchForumRevenueDaily(db).latest()
    expect(summary.totalRevenueUsdCents).toBe(0)
    expect(summary.asOf).toBeNull()
  })

  it("recomputes totals idempotently", async () => {
    await crudForumRevenueDaily(db).recomputeToday()
    const first = await fetchForumRevenueDaily(db).latest()
    expect(first.totalRevenueUsdCents).toBe(7_500 + 999_999)
    expect(first.totalCostUsdCents).toBe(2_000)
    expect(first.netUsdCents).toBe(7_500 + 999_999 - 2_000)
    expect(first.businessCount).toBe(2)

    // Running it twice must not double anything.
    await crudForumRevenueDaily(db).recomputeToday()
    const second = await fetchForumRevenueDaily(db).latest()
    expect(second.totalRevenueUsdCents).toBe(first.totalRevenueUsdCents)
  })
})
