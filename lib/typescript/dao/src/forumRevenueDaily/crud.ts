import type { DB } from "@template-nextjs/db"
import type { Kysely } from "kysely"

export function crudForumRevenueDaily(db: Kysely<DB>) {
  /** Recomputes today's rollup from the snapshot tables. Idempotent, so the job that calls
   *  it can run as often as it likes. */
  async function recomputeToday(): Promise<void> {
    const revenue = await db
      .selectFrom("businessRevenueSnapshot")
      .select((e) => [
        e.fn.sum<string>("usdNetCents").as("revenue"),
        e.fn.count<string>("businessId").distinct().as("businesses"),
      ])
      .executeTakeFirst()
    const cost = await db
      .selectFrom("businessCostSnapshot")
      .select((e) => e.fn.sum<string>("usdAmountCents").as("cost"))
      .executeTakeFirst()

    const day = new Date().toISOString().slice(0, 10)
    await db
      .insertInto("forumRevenueDaily")
      .values({
        day,
        totalRevenueUsdCents: Number(revenue?.revenue ?? 0),
        totalCostUsdCents: Number(cost?.cost ?? 0),
        businessCount: Number(revenue?.businesses ?? 0),
        computedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.column("day").doUpdateSet({
          totalRevenueUsdCents: (eb) => eb.ref("excluded.totalRevenueUsdCents"),
          totalCostUsdCents: (eb) => eb.ref("excluded.totalCostUsdCents"),
          businessCount: (eb) => eb.ref("excluded.businessCount"),
          computedAt: new Date(),
        }),
      )
      .execute()
  }

  return { recomputeToday }
}
