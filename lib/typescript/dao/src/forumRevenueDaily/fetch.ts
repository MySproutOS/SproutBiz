import type { DB } from "@template-nextjs/db"
import type { Kysely } from "kysely"

export type ForumRevenueSummary = {
  totalRevenueUsdCents: number
  totalCostUsdCents: number
  netUsdCents: number
  businessCount: number
  asOf: Date | null
}

export function fetchForumRevenueDaily(db: Kysely<DB>) {
  async function computeLive(): Promise<ForumRevenueSummary> {
    const revenue = await db
      .selectFrom("businessRevenueSnapshot")
      .select((e) => [
        e.fn.sum<string>("usdNetCents").as("revenue"),
        e.fn.count<string>("businessId").distinct().as("businesses"),
      ])
      .executeTakeFirst()
    const cost = await db
      .selectFrom("businessCostSnapshot")
      .select((e) => e.fn.sum<string>("usdAmountCents").as("cost"))
      .executeTakeFirst()

    const totalRevenueUsdCents = Number(revenue?.revenue ?? 0)
    const totalCostUsdCents = Number(cost?.cost ?? 0)
    return {
      totalRevenueUsdCents,
      totalCostUsdCents,
      netUsdCents: totalRevenueUsdCents - totalCostUsdCents,
      businessCount: Number(revenue?.businesses ?? 0),
      asOf: null,
    }
  }

  /** The landing page reads this one indexed row rather than scanning every snapshot. */
  async function latest(): Promise<ForumRevenueSummary> {
    const row = await db
      .selectFrom("forumRevenueDaily")
      .select(["totalRevenueUsdCents", "totalCostUsdCents", "businessCount", "computedAt"])
      .orderBy("day", "desc")
      .limit(1)
      .executeTakeFirst()

    // Before the aggregation job has ever run there is no rollup row. Reporting zeroes here
    // would be actively misleading -- the page would show $0 while the table below it lists
    // real revenue -- so fall back to summing the snapshots directly. This only happens until
    // the first rollup lands, and it is bounded by the same indexes the job uses.
    if (!row) {
      return await computeLive()
    }

    const totalRevenueUsdCents = Number(row.totalRevenueUsdCents)
    const totalCostUsdCents = Number(row.totalCostUsdCents)
    return {
      totalRevenueUsdCents,
      totalCostUsdCents,
      netUsdCents: totalRevenueUsdCents - totalCostUsdCents,
      businessCount: row.businessCount,
      asOf: row.computedAt,
    }
  }

  async function series(
    days: number,
  ): Promise<{ day: string; revenueUsdCents: number; costUsdCents: number }[]> {
    const rows = await db
      .selectFrom("forumRevenueDaily")
      .select(["day", "totalRevenueUsdCents", "totalCostUsdCents"])
      .orderBy("day", "desc")
      .limit(days)
      .execute()
    return rows
      .map((r) => ({
        day: String(r.day),
        revenueUsdCents: Number(r.totalRevenueUsdCents),
        costUsdCents: Number(r.totalCostUsdCents),
      }))
      .toReversed()
  }

  return { latest, series }
}
