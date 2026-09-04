import type { DB } from "@template-nextjs/db"
import { sql, type Insertable, type Kysely, type Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudContributionCodeMonth(db: Kysely<DB>) {
  async function upsertEstimate(
    data: PartialBy<Insertable<DB["contributionCodeMonth"]>, "id">,
  ): Promise<Selectable<DB["contributionCodeMonth"]>> {
    const row = await db
      .insertInto("contributionCodeMonth")
      .values({ id: v7(), ...data })
      .onConflict((oc) =>
        oc
          .columns(["userId", "businessId", "periodStart"])
          .doUpdateSet({
            mergedPrCount: (eb) => eb.ref("excluded.mergedPrCount"),
            additions: (eb) => eb.ref("excluded.additions"),
            deletions: (eb) => eb.ref("excluded.deletions"),
            changedFiles: (eb) => eb.ref("excluded.changedFiles"),
            proposedPoints: (eb) => eb.ref("excluded.proposedPoints"),
            proposedReason: (eb) => eb.ref("excluded.proposedReason"),
            evidence: (eb) => eb.ref("excluded.evidence"),
            updatedAt: new Date(),
          })
          .where("contributionCodeMonth.status", "=", "collecting"),
      )
      .returningAll()
      .executeTakeFirst()
    if (row !== undefined) return row
    return await db
      .selectFrom("contributionCodeMonth")
      .selectAll()
      .where("userId", "=", data.userId)
      .where("businessId", "=", data.businessId)
      .where(
        "periodStart",
        "=",
        sql<Date>`${data.periodStart instanceof Date ? data.periodStart.toISOString().slice(0, 10) : data.periodStart}::date`,
      )
      .executeTakeFirstOrThrow()
  }

  async function submitForReview(id: string): Promise<boolean> {
    const row = await db
      .updateTable("contributionCodeMonth")
      .set({ status: "pending_review", updatedAt: new Date() })
      .where("id", "=", id)
      .where("status", "=", "collecting")
      .where("proposedPoints", "is not", null)
      .returning("id")
      .executeTakeFirst()
    return row !== undefined
  }

  async function reject(id: string, reviewerUserId: string, reason: string): Promise<boolean> {
    const row = await db
      .updateTable("contributionCodeMonth")
      .set({
        status: "rejected",
        finalizedByUserId: reviewerUserId,
        finalizedAt: new Date(),
        proposedReason: reason,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .where("status", "=", "pending_review")
      .returning("id")
      .executeTakeFirst()
    return row !== undefined
  }

  return { upsertEstimate, submitForReview, reject }
}
