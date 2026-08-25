import { crudForumRevenueDaily } from "@lib/dao"
import { db } from "@template-nextjs/db"

/**
 * Refreshes the pre-aggregated forum totals that the landing page reads.
 *
 * Idempotent: it recomputes today's row from the snapshot tables rather than accumulating,
 * so running it twice (or after a restart) produces the same answer.
 */
export async function runRevenueAggregate(): Promise<void> {
  await crudForumRevenueDaily(db).recomputeToday()
}
