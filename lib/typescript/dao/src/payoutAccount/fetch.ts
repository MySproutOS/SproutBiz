import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchPayoutAccount(db: Kysely<DB>) {
  async function getForUser(userId: string): Promise<Selectable<DB["payoutAccount"]> | undefined> {
    return await db
      .selectFrom("payoutAccount")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirst()
  }

  async function getByStripeAccountId(
    stripeAccountId: string,
  ): Promise<Selectable<DB["payoutAccount"]> | undefined> {
    return await db
      .selectFrom("payoutAccount")
      .selectAll()
      .where("stripeAccountId", "=", stripeAccountId)
      .executeTakeFirst()
  }

  /** The destinations a payout run can actually reach, keyed by user. */
  async function payableAccountsFor(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map()
    const rows = await db
      .selectFrom("payoutAccount")
      .select(["userId", "stripeAccountId"])
      .where("userId", "in", userIds)
      .where("payoutsEnabled", "=", true)
      .execute()
    return new Map(rows.map((row) => [row.userId, row.stripeAccountId]))
  }

  return { getForUser, getByStripeAccountId, payableAccountsFor }
}
