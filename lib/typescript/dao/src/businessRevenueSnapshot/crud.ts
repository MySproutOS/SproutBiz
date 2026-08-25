import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudBusinessRevenueSnapshot(db: Kysely<DB>) {
  /**
   * Upsert on (business_id, source, period).
   *
   * Providers restate closed periods when refunds and chargebacks settle, so a sync must be
   * safely repeatable: re-running one overwrites the period rather than adding to it.
   */
  async function upsert(
    data: PartialBy<Insertable<DB["businessRevenueSnapshot"]>, "id">,
  ): Promise<Selectable<DB["businessRevenueSnapshot"]>> {
    return await db
      .insertInto("businessRevenueSnapshot")
      .values({ id: v7(), ...data })
      .onConflict((oc) =>
        oc.columns(["businessId", "source", "periodStart", "periodEnd"]).doUpdateSet({
          currency: (eb) => eb.ref("excluded.currency"),
          grossCents: (eb) => eb.ref("excluded.grossCents"),
          refundsCents: (eb) => eb.ref("excluded.refundsCents"),
          feesCents: (eb) => eb.ref("excluded.feesCents"),
          netCents: (eb) => eb.ref("excluded.netCents"),
          usdNetCents: (eb) => eb.ref("excluded.usdNetCents"),
          fxRate: (eb) => eb.ref("excluded.fxRate"),
          capturedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return { upsert }
}
