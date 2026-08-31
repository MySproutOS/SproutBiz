import type { DB } from "@template-nextjs/db"
import { fromPgDate } from "@utils/marketing"

import { type Kysely, type Selectable, sql } from "kysely"

export type MarketingPool = {
  id: string
  businessId: string
  /** "YYYY-MM-01". A string so no timezone can shift it a day. */
  month: string
  poolUsdCents: number
  suggestedUsdCents: number
  notes: string | null
  status: string
  computedAt: Date | null
  paidAt: Date | null
}

function toPool(row: Selectable<DB["marketingPayoutPool"]>): MarketingPool {
  return {
    id: row.id,
    businessId: row.businessId,
    month: fromPgDate(row.month),
    poolUsdCents: Number(row.poolUsdCents),
    suggestedUsdCents: Number(row.suggestedUsdCents),
    notes: row.notes,
    status: row.status,
    computedAt: row.computedAt,
    paidAt: row.paidAt,
  }
}

/** "YYYY-MM-01" as a Postgres date. See crud.ts for why this is not a Date. */
const monthValue = (month: string) => sql<Date>`${month}::date`

export function fetchMarketingPayoutPool(db: Kysely<DB>) {
  async function getOne(id: string): Promise<MarketingPool | undefined> {
    const row = await db
      .selectFrom("marketingPayoutPool")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()
    return row && toPool(row)
  }

  async function listForMonth(month: string): Promise<MarketingPool[]> {
    const rows = await db
      .selectFrom("marketingPayoutPool")
      .selectAll()
      .where("month", "=", monthValue(month))
      .execute()
    return rows.map(toPool)
  }

  async function getForBusinessMonth(
    businessId: string,
    month: string,
  ): Promise<MarketingPool | undefined> {
    const row = await db
      .selectFrom("marketingPayoutPool")
      .selectAll()
      .where("businessId", "=", businessId)
      .where("month", "=", monthValue(month))
      .executeTakeFirst()
    return row && toPool(row)
  }

  return { getOne, listForMonth, getForBusinessMonth }
}
