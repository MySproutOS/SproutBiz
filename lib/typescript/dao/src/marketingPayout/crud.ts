import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable, Updateable } from "kysely"
import { v7 } from "uuid"

export type PayoutRowInput = {
  videoId: string
  userId: string
  weightedViews: number
  shareBp: number
  grossUsdCents: number
  feeUsdCents: number
  netUsdCents: number
}

export function crudMarketingPayout(db: Kysely<DB>) {
  /**
   * Writes a pool's payout rows, replacing any previous draft calculation.
   *
   * In one transaction, and only ever called for a pool still in `draft`: once money has
   * moved, a recalculation would silently rewrite what somebody was actually paid.
   */
  async function replaceForPool(poolId: string, rows: PayoutRowInput[]): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("marketingPayout").where("poolId", "=", poolId).execute()
      if (rows.length === 0) return
      await trx
        .insertInto("marketingPayout")
        .values(
          rows.map((row) => ({
            id: v7(),
            poolId,
            videoId: row.videoId,
            userId: row.userId,
            weightedViews: String(row.weightedViews),
            shareBp: row.shareBp,
            grossUsdCents: String(row.grossUsdCents),
            feeUsdCents: String(row.feeUsdCents),
            netUsdCents: String(row.netUsdCents),
          })),
        )
        .execute()
    })
  }

  async function update(
    id: string,
    data: Updateable<DB["marketingPayout"]>,
  ): Promise<Selectable<DB["marketingPayout"]> | undefined> {
    return await db
      .updateTable("marketingPayout")
      .set(data)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()
  }

  /**
   * Records a completed transfer, but refuses to overwrite one.
   *
   * The `stripe_transfer_id is null` guard is the safety net behind pressing Pay twice: a
   * row that already moved money cannot be marked pending-and-paid again.
   */
  async function recordTransfer(id: string, stripeTransferId: string): Promise<boolean> {
    const result = await db
      .updateTable("marketingPayout")
      .set({ stripeTransferId, status: "paid", paidAt: new Date(), failureReason: null })
      .where("id", "=", id)
      .where("stripeTransferId", "is", null)
      .executeTakeFirst()
    return (result.numUpdatedRows ?? 0n) > 0n
  }

  return { replaceForPool, update, recordTransfer }
}
