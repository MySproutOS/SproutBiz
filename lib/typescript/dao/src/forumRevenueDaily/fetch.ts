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
  /** The landing page reads this one indexed row rather than scanning every snapshot. */
  async function latest(): Promise<ForumRevenueSummary> {
    const row = await db
      .selectFrom("forumRevenueDaily")
      .select(["totalRevenueUsdCents", "totalCostUsdCents", "businessCount", "computedAt"])
      .orderBy("day", "desc")
      .limit(1)
      .executeTakeFirst()

    // No rollup yet is a legitimate state on a new forum: report zeroes rather than failing.
    if (!row) {
      return {
        totalRevenueUsdCents: 0,
        totalCostUsdCents: 0,
        netUsdCents: 0,
        businessCount: 0,
        asOf: null,
      }
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
