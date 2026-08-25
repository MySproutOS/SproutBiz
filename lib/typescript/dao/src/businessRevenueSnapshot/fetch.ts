import type { DB } from "@template-nextjs/db"
import type { Kysely } from "kysely"

export type RevenuePeriod = {
  periodStart: Date
  periodEnd: Date
  source: string
  usdNetCents: number
}

export function fetchBusinessRevenueSnapshot(db: Kysely<DB>) {
  async function listForBusiness(businessId: string, limit = 24): Promise<RevenuePeriod[]> {
    const rows = await db
      .selectFrom("businessRevenueSnapshot")
      .select(["periodStart", "periodEnd", "source", "usdNetCents"])
      .where("businessId", "=", businessId)
      .orderBy("periodStart", "desc")
      .limit(limit)
      .execute()
    // bigint arrives as a string from the driver; convert once here.
    return rows.map((r) => ({ ...r, usdNetCents: Number(r.usdNetCents) }))
  }

  async function totals(): Promise<{ revenueUsdCents: number; businessCount: number }> {
    const row = await db
      .selectFrom("businessRevenueSnapshot")
      .select((e) => [
        e.fn.sum<string>("usdNetCents").as("revenue"),
        e.fn.count<string>("businessId").distinct().as("businesses"),
      ])
      .executeTakeFirst()
    return {
      revenueUsdCents: Number(row?.revenue ?? 0),
      businessCount: Number(row?.businesses ?? 0),
    }
  }

  return { listForBusiness, totals }
}
