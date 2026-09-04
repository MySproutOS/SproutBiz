import type { DB } from "@template-nextjs/db"
import { sql, type Kysely, type Selectable } from "kysely"

export function fetchContributionCodeMonth(db: Kysely<DB>) {
  async function get(id: string): Promise<Selectable<DB["contributionCodeMonth"]> | undefined> {
    return await db
      .selectFrom("contributionCodeMonth")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()
  }

  async function listForUser(
    userId: string,
    limit = 24,
  ): Promise<Selectable<DB["contributionCodeMonth"]>[]> {
    return await db
      .selectFrom("contributionCodeMonth")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("periodStart", "desc")
      .limit(limit)
      .execute()
  }

  async function listForReview(limit = 100): Promise<Selectable<DB["contributionCodeMonth"]>[]> {
    return await db
      .selectFrom("contributionCodeMonth")
      .selectAll()
      .where("status", "=", "pending_review")
      .orderBy("periodStart", "asc")
      .limit(limit)
      .execute()
  }

  async function listCollectingBefore(
    periodStart: Date | string,
    limit = 500,
  ): Promise<Selectable<DB["contributionCodeMonth"]>[]> {
    return await db
      .selectFrom("contributionCodeMonth")
      .selectAll()
      .where("status", "=", "collecting")
      .where(
        "periodStart",
        "<",
        sql<Date>`${periodStart instanceof Date ? periodStart.toISOString().slice(0, 10) : periodStart}::date`,
      )
      .orderBy("periodStart", "asc")
      .limit(limit)
      .execute()
  }

  return { get, listForUser, listForReview, listCollectingBefore }
}
