import type { DB } from "@template-nextjs/db"
import type { Kysely } from "kysely"

export function fetchDonation(db: Kysely<DB>) {
  async function totalPaidCents(): Promise<number> {
    const row = await db
      .selectFrom("donation")
      .select((e) => e.fn.sum<string>("amountCents").as("total"))
      .where("status", "=", "paid")
      .executeTakeFirst()
    return Number(row?.total ?? 0)
  }

  return { totalPaidCents }
}
