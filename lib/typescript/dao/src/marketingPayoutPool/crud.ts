import type { DB } from "@template-nextjs/db"
import { type Kysely, type Selectable, type Updateable, sql } from "kysely"
import { v7 } from "uuid"

/** "YYYY-MM-01" as a Postgres date, without letting a Date carry a timezone into it. */
const monthValue = (month: string) => sql<Date>`${month}::date`

export function crudMarketingPayoutPool(db: Kysely<DB>) {
  /**
   * One pool per business per month, whichever way an admin gets to it.
   *
   * `month` is a "YYYY-MM-01" string rather than a Date: see monthDateString in the
   * marketing utils for why a Date here files pools under the wrong month.
   */
  async function upsert(
    businessId: string,
    month: string,
    data: { poolUsdCents: number; suggestedUsdCents: number; notes?: string | null },
  ): Promise<Selectable<DB["marketingPayoutPool"]>> {
    return await db
      .insertInto("marketingPayoutPool")
      .values({
        id: v7(),
        businessId,
        month: monthValue(month),
        poolUsdCents: String(data.poolUsdCents),
        suggestedUsdCents: String(data.suggestedUsdCents),
        notes: data.notes ?? null,
      })
      .onConflict((oc) =>
        oc.columns(["businessId", "month"]).doUpdateSet({
          poolUsdCents: String(data.poolUsdCents),
          suggestedUsdCents: String(data.suggestedUsdCents),
          notes: data.notes ?? null,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function update(
    id: string,
    data: Updateable<DB["marketingPayoutPool"]>,
  ): Promise<Selectable<DB["marketingPayoutPool"]> | undefined> {
    return await db
      .updateTable("marketingPayoutPool")
      .set(data)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()
  }

  return { upsert, update }
}
