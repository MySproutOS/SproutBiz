import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudBusinessCostSnapshot(db: Kysely<DB>) {
  async function upsert(
    data: PartialBy<Insertable<DB["businessCostSnapshot"]>, "id">,
  ): Promise<Selectable<DB["businessCostSnapshot"]>> {
    return await db
      .insertInto("businessCostSnapshot")
      .values({ id: v7(), ...data })
      .onConflict((oc) =>
        oc.columns(["businessId", "source", "category", "periodStart", "periodEnd"]).doUpdateSet({
          currency: (eb) => eb.ref("excluded.currency"),
          amountCents: (eb) => eb.ref("excluded.amountCents"),
          usdAmountCents: (eb) => eb.ref("excluded.usdAmountCents"),
          fxRate: (eb) => eb.ref("excluded.fxRate"),
          capturedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return { upsert }
}
