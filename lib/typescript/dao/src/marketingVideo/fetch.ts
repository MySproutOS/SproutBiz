import type { DB } from "@template-nextjs/db"
import { type MarketingPlatform, PLATFORMS } from "@utils/marketing"
import { type Kysely, type Selectable, sql } from "kysely"

/** A video with the business and submitter already resolved, for the review queue and /payouts. */
export type MarketingVideoRow = {
  id: string
  businessId: string
  businessName: string
  businessSlug: string
  submitterUserId: string
  submitterUsername: string
  platform: string
  externalVideoId: string
  url: string
  status: string
  rejectionReason: string | null
  durationSeconds: number | null
  postedAt: Date | null
  measureAt: Date | null
  viewCount: number | null
  weightedViews: number | null
  submittedAt: Date
}

/**
 * Videos whose 30-day window closes inside a given month, and which cleared their platform's
 * view floor.
 *
 * The floor is a CASE over the platform rather than a constant because it differs by
 * platform, and applying it in SQL keeps a business's pool from ever being split with a
 * video that was never eligible for it.
 */
// Table-qualified: `business` has a `platform` column too, and the join makes a bare
// reference ambiguous.
const MIN_VIEWS_CASE = sql<boolean>`
  marketing_video.view_count >= CASE marketing_video.platform
    ${sql.join(
      Object.entries(PLATFORMS).map(
        ([platform, rules]) => sql`WHEN ${sql.lit(platform)} THEN ${sql.lit(rules.minViews)}`,
      ),
      sql` `,
    )}
    ELSE 2147483647
  END
`

export function fetchMarketingVideo(db: Kysely<DB>) {
  function baseQuery() {
    return db
      .selectFrom("marketingVideo")
      .innerJoin("business", "business.id", "marketingVideo.businessId")
      .innerJoin("user", "user.id", "marketingVideo.submitterUserId")
      .select([
        "marketingVideo.id",
        "marketingVideo.businessId",
        "business.name as businessName",
        "business.slug as businessSlug",
        "marketingVideo.submitterUserId",
        "user.username as submitterUsername",
        "marketingVideo.platform",
        "marketingVideo.externalVideoId",
        "marketingVideo.url",
        "marketingVideo.status",
        "marketingVideo.rejectionReason",
        "marketingVideo.durationSeconds",
        "marketingVideo.postedAt",
        "marketingVideo.measureAt",
        "marketingVideo.viewCount",
        "marketingVideo.weightedViews",
        "marketingVideo.submittedAt",
      ])
  }

  function toRow(row: Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number]) {
    return {
      ...row,
      // bigint arrives as a string from pg; convert once here rather than at every call site.
      viewCount: row.viewCount === null ? null : Number(row.viewCount),
      weightedViews: row.weightedViews === null ? null : Number(row.weightedViews),
    } satisfies MarketingVideoRow
  }

  async function getOne<T extends (keyof DB["marketingVideo"])[]>(
    id: string,
    fields: T,
  ): Promise<Pick<Selectable<DB["marketingVideo"]>, T[number]> | undefined> {
    return await db
      .selectFrom("marketingVideo")
      .select(fields)
      .where("id", "=", id)
      .executeTakeFirst()
  }

  /** The duplicate check behind "the first person to submit the video earns the money". */
  async function findByExternalId(
    platform: MarketingPlatform,
    externalVideoId: string,
  ): Promise<
    | Pick<Selectable<DB["marketingVideo"]>, "id" | "businessId" | "submitterUserId" | "status">
    | undefined
  > {
    return await db
      .selectFrom("marketingVideo")
      .select(["id", "businessId", "submitterUserId", "status"])
      .where("platform", "=", platform)
      .where("externalVideoId", "=", externalVideoId)
      .executeTakeFirst()
  }

  /** One fully-resolved row, for echoing a submission straight back to its submitter. */
  async function getRow(id: string): Promise<MarketingVideoRow | undefined> {
    const row = await baseQuery().where("marketingVideo.id", "=", id).executeTakeFirst()
    return row && toRow(row)
  }

  /**
   * Per-business video and payout totals, for the business list on /earn.
   *
   * One grouped query for the whole page rather than two per business -- the list is the
   * page's main content and will grow with every business we launch.
   */
  async function countsByBusiness(
    businessIds: string[],
  ): Promise<Map<string, { videoCount: number; paidOutUsdCents: number }>> {
    if (businessIds.length === 0) return new Map()
    const rows = await db
      .selectFrom("marketingVideo")
      .leftJoin("marketingPayout", (join) =>
        join
          .onRef("marketingPayout.videoId", "=", "marketingVideo.id")
          .on("marketingPayout.status", "=", "paid"),
      )
      .select((eb) => [
        "marketingVideo.businessId",
        eb.fn.count<string>("marketingVideo.id").distinct().as("videoCount"),
        eb.fn.sum<string>("marketingPayout.netUsdCents").as("paidOut"),
      ])
      .where("marketingVideo.businessId", "in", businessIds)
      // A rejected submission is not something to advertise as participation.
      .where("marketingVideo.status", "!=", "rejected")
      .groupBy("marketingVideo.businessId")
      .execute()
    return new Map(
      rows.map((row) => [
        row.businessId,
        { videoCount: Number(row.videoCount ?? 0), paidOutUsdCents: Number(row.paidOut ?? 0) },
      ]),
    )
  }

  async function listForUser(userId: string, limit = 100): Promise<MarketingVideoRow[]> {
    const rows = await baseQuery()
      .where("marketingVideo.submitterUserId", "=", userId)
      .orderBy("marketingVideo.createdAt", "desc")
      .limit(limit)
      .execute()
    return rows.map(toRow)
  }

  async function listForBusiness(businessId: string, limit = 100): Promise<MarketingVideoRow[]> {
    const rows = await baseQuery()
      .where("marketingVideo.businessId", "=", businessId)
      .orderBy("marketingVideo.createdAt", "desc")
      .limit(limit)
      .execute()
    return rows.map(toRow)
  }

  /** The admin review queue. `status` omitted means everything still needing a human. */
  async function listForReview(status?: string, limit = 200): Promise<MarketingVideoRow[]> {
    let query = baseQuery()
    query =
      status === undefined
        ? query.where("marketingVideo.status", "in", ["pending", "approved"])
        : query.where("marketingVideo.status", "=", status)
    const rows = await query.orderBy("marketingVideo.submittedAt", "asc").limit(limit).execute()
    return rows.map(toRow)
  }

  /**
   * Approved videos whose window closes within `withinMs`, for the Slack reminder sweep.
   *
   * `unsentColumn` is the once-only guard: a video already reminded about is not returned.
   */
  async function listNeedingReminder(
    now: Date,
    withinMs: number,
    unsentColumn: "reminderDayBeforeSentAt" | "reminderDueSentAt",
  ): Promise<MarketingVideoRow[]> {
    const rows = await baseQuery()
      .where("marketingVideo.status", "=", "approved")
      .where("marketingVideo.measureAt", "is not", null)
      .where("marketingVideo.measureAt", "<=", new Date(now.getTime() + withinMs))
      .where(`marketingVideo.${unsentColumn}`, "is", null)
      .orderBy("marketingVideo.measureAt", "asc")
      .limit(100)
      .execute()
    return rows.map(toRow)
  }

  /**
   * Videos a pool should be split between: measured, over their platform's floor, and with a
   * window that closed inside the given month.
   *
   * Keying on when the window CLOSED rather than when the video was posted is what produces
   * the carry-over -- a video posted on 20 January is measured on 19 February and paid in
   * the February run.
   */
  async function eligibleForMonth(
    businessId: string,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<MarketingVideoRow[]> {
    const rows = await baseQuery()
      .where("marketingVideo.businessId", "=", businessId)
      .where("marketingVideo.status", "in", ["measured", "paid"])
      .where("marketingVideo.measureAt", ">=", monthStart)
      .where("marketingVideo.measureAt", "<", monthEnd)
      .where("marketingVideo.viewCount", "is not", null)
      .where(MIN_VIEWS_CASE)
      .orderBy("marketingVideo.weightedViews", "desc")
      .execute()
    return rows.map(toRow)
  }

  return {
    getOne,
    getRow,
    countsByBusiness,
    findByExternalId,
    listForUser,
    listForBusiness,
    listForReview,
    listNeedingReminder,
    eligibleForMonth,
  }
}
