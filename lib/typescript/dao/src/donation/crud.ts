import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudDonation(db: Kysely<DB>) {
  async function create(
    data: PartialBy<Insertable<DB["donation"]>, "id">,
  ): Promise<Selectable<DB["donation"]>> {
    return await db
      .insertInto("donation")
      .values({ id: v7(), ...data })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  /**
   * Marks a checkout session as paid.
   *
   * Keyed on the Stripe session id and safe to call repeatedly: Stripe retries webhooks and
   * does not promise to deliver each event exactly once, so this must be idempotent.
   */
  async function markPaid(
    stripeCheckoutSessionId: string,
    data: { stripePaymentIntentId: string | null; amountCents: number; email: string | null },
  ): Promise<boolean> {
    const result = await db
      .updateTable("donation")
      .set({
        status: "paid",
        stripePaymentIntentId: data.stripePaymentIntentId,
        amountCents: data.amountCents,
        email: data.email,
      })
      .where("stripeCheckoutSessionId", "=", stripeCheckoutSessionId)
      .executeTakeFirst()
    return (result.numUpdatedRows ?? 0n) > 0n
  }

  return { create, markPaid }
}
