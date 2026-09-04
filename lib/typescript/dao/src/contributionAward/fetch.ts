import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export type ContributionPointSummary = {
  total: number
  byBusiness: Array<{ businessId: string; businessName: string; points: number }>
}

export function fetchContributionAward(db: Kysely<DB>) {
  async function listForUser(
    userId: string,
    limit = 100,
  ): Promise<Selectable<DB["contributionAward"]>[]> {
    return await db
      .selectFrom("contributionAward")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .execute()
  }

  async function summarizeForUser(userId: string): Promise<ContributionPointSummary> {
    const rows = await db
      .selectFrom("contributionAward")
      .innerJoin("business", "business.id", "contributionAward.businessId")
      .select((eb) => [
        "contributionAward.businessId",
        "business.name as businessName",
        eb.fn.sum<string>("contributionAward.points").as("points"),
      ])
      .where("contributionAward.userId", "=", userId)
      .groupBy(["contributionAward.businessId", "business.name"])
      .orderBy("points", "desc")
      .execute()
    const byBusiness = rows.map((row) => ({
      businessId: row.businessId,
      businessName: row.businessName,
      points: Number(row.points ?? 0),
    }))
    return { total: byBusiness.reduce((sum, row) => sum + row.points, 0), byBusiness }
  }

  return { listForUser, summarizeForUser }
}
