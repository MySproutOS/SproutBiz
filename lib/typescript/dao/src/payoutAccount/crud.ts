import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable, Updateable } from "kysely"

export function crudPayoutAccount(db: Kysely<DB>) {
  async function create(
    userId: string,
    stripeAccountId: string,
  ): Promise<Selectable<DB["payoutAccount"]>> {
    return await db
      .insertInto("payoutAccount")
      .values({ userId, stripeAccountId })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function update(
    userId: string,
    data: Updateable<DB["payoutAccount"]>,
  ): Promise<Selectable<DB["payoutAccount"]> | undefined> {
    return await db
      .updateTable("payoutAccount")
      .set({ ...data, updatedAt: new Date() })
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirst()
  }

  /**
   * Writes back what Stripe says about a connected account.
   *
   * Keyed on the Stripe id rather than our user id so the `account.updated` webhook, which
   * only knows the `acct_...`, can use the same path as the in-app refresh button.
   */
  async function syncFromStripe(
    stripeAccountId: string,
    flags: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean },
  ): Promise<Selectable<DB["payoutAccount"]> | undefined> {
    return await db
      .updateTable("payoutAccount")
      .set({
        ...flags,
        status: flags.payoutsEnabled ? "active" : flags.detailsSubmitted ? "restricted" : "pending",
        updatedAt: new Date(),
      })
      .where("stripeAccountId", "=", stripeAccountId)
      .returningAll()
      .executeTakeFirst()
  }

  return { create, update, syncFromStripe }
}
