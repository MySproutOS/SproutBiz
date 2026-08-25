import type { DB } from "@template-nextjs/db"
import type { Kysely } from "kysely"

export function fetchBusinessCostSnapshot(db: Kysely<DB>) {
  async function total(): Promise<number> {
    const row = await db
      .selectFrom("businessCostSnapshot")
      .select((e) => e.fn.sum<string>("usdAmountCents").as("cost"))
      .executeTakeFirst()
    return Number(row?.cost ?? 0)
  }

  async function byCategoryForBusiness(
    businessId: string,
  ): Promise<{ category: string; usdAmountCents: number }[]> {
    const rows = await db
      .selectFrom("businessCostSnapshot")
      .select((e) => ["category", e.fn.sum<string>("usdAmountCents").as("amount")])
      .where("businessId", "=", businessId)
      .groupBy("category")
      .execute()
    return rows.map((r) => ({ category: r.category, usdAmountCents: Number(r.amount) }))
  }

  return { total, byCategoryForBusiness }
}
