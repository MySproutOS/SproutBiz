import type { DB } from "@template-nextjs/db"
import { fromPgDate } from "@utils/marketing"
import { type Kysely, sql } from "kysely"

export type MarketingPayoutRow = {
  id: string
  poolId: string
  videoId: string
  userId: string
  username: string
  businessName: string
  businessSlug: string
  platform: string
  url: string
  /** "YYYY-MM-01", as stored. */
  month: string
  viewCount: number | null
  weightedViews: number
  shareBp: number
  grossUsdCents: number
  feeUsdCents: number
  netUsdCents: number
  status: string
  failureReason: string | null
  paidAt: Date | null
}

/** "YYYY-MM-01" as a Postgres date, matching how pools store their month. */
const monthValue = (month: string) => sql<Date>`${month}::date`

export function fetchMarketingPayout(db: Kysely<DB>) {
  function baseQuery() {
    return db
      .selectFrom("marketingPayout")
      .innerJoin("marketingPayoutPool", "marketingPayoutPool.id", "marketingPayout.poolId")
      .innerJoin("marketingVideo", "marketingVideo.id", "marketingPayout.videoId")
      .innerJoin("business", "business.id", "marketingPayoutPool.businessId")
      .innerJoin("user", "user.id", "marketingPayout.userId")
      .select([
        "marketingPayout.id",
        "marketingPayout.poolId",
        "marketingPayout.videoId",
        "marketingPayout.userId",
        "user.username",
        "business.name as businessName",
        "business.slug as businessSlug",
        "marketingVideo.platform",
        "marketingVideo.url",
        "marketingPayoutPool.month",
        "marketingVideo.viewCount",
        "marketingPayout.weightedViews",
        "marketingPayout.shareBp",
        "marketingPayout.grossUsdCents",
        "marketingPayout.feeUsdCents",
        "marketingPayout.netUsdCents",
        "marketingPayout.status",
        "marketingPayout.failureReason",
        "marketingPayout.paidAt",
      ])
  }

  function toRow(row: Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number]) {
    return {
      ...row,
      month: fromPgDate(row.month),
      viewCount: row.viewCount === null ? null : Number(row.viewCount),
      weightedViews: Number(row.weightedViews),
      grossUsdCents: Number(row.grossUsdCents),
      feeUsdCents: Number(row.feeUsdCents),
      netUsdCents: Number(row.netUsdCents),
    } satisfies MarketingPayoutRow
  }

  async function listForPool(poolId: string): Promise<MarketingPayoutRow[]> {
    const rows = await baseQuery()
      .where("marketingPayout.poolId", "=", poolId)
      .orderBy("marketingPayout.grossUsdCents", "desc")
      .execute()
    return rows.map(toRow)
  }

  /** What the public /payouts page shows: money that actually moved, newest month first. */
  async function listPaid(month?: string, limit = 500): Promise<MarketingPayoutRow[]> {
    let query = baseQuery().where("marketingPayout.status", "=", "paid")
    if (month !== undefined) {
      query = query.where("marketingPayoutPool.month", "=", monthValue(month))
    }
    const rows = await query
      .orderBy("marketingPayoutPool.month", "desc")
      .orderBy("marketingPayout.netUsdCents", "desc")
      .limit(limit)
      .execute()
    return rows.map(toRow)
  }

  async function listForUser(userId: string, limit = 200): Promise<MarketingPayoutRow[]> {
    const rows = await baseQuery()
      .where("marketingPayout.userId", "=", userId)
      .orderBy("marketingPayoutPool.month", "desc")
      .limit(limit)
      .execute()
    return rows.map(toRow)
  }

  async function totalPaidUsdCents(): Promise<number> {
    const row = await db
      .selectFrom("marketingPayout")
      .select((eb) => eb.fn.sum<string>("netUsdCents").as("total"))
      .where("status", "=", "paid")
      .executeTakeFirst()
    return Number(row?.total ?? 0)
  }

  return { listForPool, listPaid, listForUser, totalPaidUsdCents }
}
