import {
  crudMarketingPayout,
  crudMarketingPayoutPool,
  crudMarketingVideo,
  fetchBusiness,
  fetchMarketingPayout,
  fetchMarketingPayoutPool,
  fetchMarketingVideo,
  fetchPayoutAccount,
  type MarketingVideoRow,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import {
  MARKETING_POOL_PERCENT,
  MIN_DURATION_SECONDS,
  PLATFORMS,
  isMarketingPlatform,
  measurementDeadline,
  meetsViewMinimum,
  monthDateString,
  monthEnd,
  monthStart,
  platformLabel,
  splitPool,
  weightedViews,
} from "@utils/marketing"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { ErrorSchemaResponse, IdParamT } from "../utils/common.serializer"
import { ErrorCode } from "../utils/errors.enum"
import { throwBadRequest, throwError, throwNotFound } from "../utils/http-exception"
import { stripe } from "../utils/stripe"
import { adminAuthMiddleware } from "./middleware"
import {
  adminPayoutListSchemaResponse,
  adminPoolListSchemaResponse,
  adminPoolQuerySchemaRequest,
  adminPoolSetSchemaRequest,
  adminVideoApproveSchemaRequest,
  adminVideoListSchemaResponse,
  adminVideoQuerySchemaRequest,
  adminVideoRejectSchemaRequest,
  adminVideoSchemaResponse,
  adminVideoViewsSchemaRequest,
} from "./marketing.serializer"

function serializeVideo(row: MarketingVideoRow) {
  const platform = isMarketingPlatform(row.platform) ? row.platform : null
  const minViews = platform ? PLATFORMS[platform].minViews : 0
  return {
    id: row.id,
    businessId: row.businessId,
    businessName: row.businessName,
    businessSlug: row.businessSlug,
    submitterUserId: row.submitterUserId,
    submitterUsername: row.submitterUsername,
    platform: row.platform,
    platformLabel: platformLabel(row.platform),
    url: row.url,
    status: row.status,
    rejectionReason: row.rejectionReason,
    durationSeconds: row.durationSeconds,
    postedAt: row.postedAt?.toISOString() ?? null,
    measureAt: row.measureAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    weightedViews: row.weightedViews,
    minViews,
    meetsMinimum:
      platform !== null && row.viewCount !== null && meetsViewMinimum(platform, row.viewCount),
    submittedAt: row.submittedAt.toISOString(),
  }
}

/** 20% of net profit, never negative -- a loss-making month funds no pool. */
function suggestedPoolCents(netUsdCents: number): number {
  return Math.max(0, Math.floor((netUsdCents * MARKETING_POOL_PERCENT) / 100))
}

const app = new Hono()
  .use(adminAuthMiddleware)
  .get(
    "/videos",
    describeRoute({
      description: "The video review queue",
      responses: {
        200: {
          description: "Videos",
          content: { "application/json": { schema: resolver(adminVideoListSchemaResponse) } },
        },
      },
    }),
    validator("query", adminVideoQuerySchemaRequest),
    async (c) => {
      const rows = await fetchMarketingVideo(db).listForReview(c.req.valid("query").status)
      return c.json({ data: rows.map(serializeVideo) })
    },
  )
  .post(
    "/videos/:id/approve",
    describeRoute({
      description: "Approves a video and starts its 30-day counting window",
      responses: {
        200: {
          description: "Approved",
          content: { "application/json": { schema: resolver(adminVideoSchemaResponse) } },
        },
        400: {
          description: "Too short, or already reviewed",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", adminVideoApproveSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const { postedAt, durationSeconds } = c.req.valid("json")

      // Re-checked here rather than trusted from the client: this is the rule the program
      // publishes, and the admin UI is not the only thing that can call it.
      if (durationSeconds < MIN_DURATION_SECONDS) {
        return throwBadRequest(
          c,
          `A video must be at least ${MIN_DURATION_SECONDS} seconds long to qualify`,
        )
      }

      const existing = await fetchMarketingVideo(db).getOne(id, ["status"])
      if (!existing) return throwNotFound(c, "No such video")
      if (existing.status !== "pending") {
        return throwBadRequest(c, `That video is already ${existing.status}`)
      }

      const posted = new Date(postedAt)
      if (Number.isNaN(posted.getTime())) {
        return throwBadRequest(c, "postedAt is not a valid date")
      }

      await crudMarketingVideo(db).update(id, {
        status: "approved",
        postedAt: posted,
        measureAt: measurementDeadline(posted),
        durationSeconds,
        reviewedByUserId: c.var.user.id,
        reviewedAt: new Date(),
        rejectionReason: null,
      })

      const row = await fetchMarketingVideo(db).getRow(id)
      if (!row) return throwNotFound(c, "No such video")
      return c.json({ data: serializeVideo(row) }, 200)
    },
  )
  .post(
    "/videos/:id/reject",
    describeRoute({
      description: "Rejects a video, with a reason the submitter will see",
      responses: {
        200: {
          description: "Rejected",
          content: { "application/json": { schema: resolver(adminVideoSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", adminVideoRejectSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const updated = await crudMarketingVideo(db).update(id, {
        status: "rejected",
        rejectionReason: c.req.valid("json").reason,
        reviewedByUserId: c.var.user.id,
        reviewedAt: new Date(),
      })
      if (!updated) return throwNotFound(c, "No such video")
      const row = await fetchMarketingVideo(db).getRow(id)
      if (!row) return throwNotFound(c, "No such video")
      return c.json({ data: serializeVideo(row) }, 200)
    },
  )
  .post(
    "/videos/:id/views",
    describeRoute({
      description: "Records the view count read at the 30-day mark",
      responses: {
        200: {
          description: "Recorded",
          content: { "application/json": { schema: resolver(adminVideoSchemaResponse) } },
        },
        400: {
          description: "Not an approved video, or an unknown platform",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", adminVideoViewsSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const { viewCount } = c.req.valid("json")

      const existing = await fetchMarketingVideo(db).getOne(id, ["status", "platform"])
      if (!existing) return throwNotFound(c, "No such video")
      if (!isMarketingPlatform(existing.platform)) {
        return throwBadRequest(c, "That video has an unknown platform")
      }
      // Only an approved video has a window to have closed. Entering views against a
      // rejected one, or re-entering them after payout, would rewrite a settled figure.
      if (existing.status !== "approved" && existing.status !== "measured") {
        return throwBadRequest(c, `Cannot record views for a ${existing.status} video`)
      }

      await crudMarketingVideo(db).update(id, {
        viewCount: String(viewCount),
        weightedViews: String(weightedViews(existing.platform, viewCount)),
        viewCountRecordedAt: new Date(),
        status: "measured",
      })

      const row = await fetchMarketingVideo(db).getRow(id)
      if (!row) return throwNotFound(c, "No such video")
      return c.json({ data: serializeVideo(row) }, 200)
    },
  )
  .get(
    "/pools",
    describeRoute({
      description: "Every business's pool for a month, with the 20% suggestion",
      responses: {
        200: {
          description: "Pools",
          content: { "application/json": { schema: resolver(adminPoolListSchemaResponse) } },
        },
      },
    }),
    validator("query", adminPoolQuerySchemaRequest),
    async (c) => {
      const { month } = c.req.valid("query")
      const start = monthStart(month)
      if (start === null) return throwBadRequest(c, "month must look like 2026-02")
      const end = monthEnd(start)

      const [businesses, pools] = await Promise.all([
        fetchBusiness(db).listWithTotals(500),
        fetchMarketingPayoutPool(db).listForMonth(monthDateString(month)),
      ])
      const poolByBusiness = new Map(pools.map((pool) => [pool.businessId, pool]))

      const data = await Promise.all(
        businesses.map(async (business) => {
          const eligible = await fetchMarketingVideo(db).eligibleForMonth(business.id, start, end)
          const pool = poolByBusiness.get(business.id)
          const suggested = suggestedPoolCents(business.netUsdCents)
          return {
            businessId: business.id,
            businessName: business.name,
            businessSlug: business.slug,
            month,
            poolId: pool?.id ?? null,
            revenueUsdCents: business.revenueUsdCents,
            costUsdCents: business.costUsdCents,
            netUsdCents: business.netUsdCents,
            suggestedUsdCents: suggested,
            poolUsdCents: pool?.poolUsdCents ?? 0,
            notes: pool?.notes ?? null,
            status: pool?.status ?? "draft",
            eligibleVideoCount: eligible.length,
            totalWeightedViews: eligible.reduce((sum, v) => sum + (v.weightedViews ?? 0), 0),
          }
        }),
      )

      return c.json({ data })
    },
  )
  .put(
    "/pools",
    describeRoute({
      description: "Sets the dollar pool a business will pay out for a month",
      responses: {
        200: {
          description: "Pool saved",
          content: { "application/json": { schema: resolver(adminPayoutListSchemaResponse) } },
        },
        400: {
          description: "The pool has already been paid",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", adminPoolSetSchemaRequest),
    async (c) => {
      const { businessId, month, poolUsdCents, notes } = c.req.valid("json")
      if (monthStart(month) === null) return throwBadRequest(c, "month must look like 2026-02")

      const existing = await fetchMarketingPayoutPool(db).getForBusinessMonth(
        businessId,
        monthDateString(month),
      )
      if (existing?.status === "paid") {
        return throwBadRequest(c, "That pool has already been paid and cannot be changed")
      }

      const business = await fetchBusiness(db).listWithTotals(500)
      const totals = business.find((b) => b.id === businessId)
      if (!totals) return throwNotFound(c, "No such business")

      const pool = await crudMarketingPayoutPool(db).upsert(businessId, monthDateString(month), {
        poolUsdCents,
        suggestedUsdCents: suggestedPoolCents(totals.netUsdCents),
        notes: notes ?? null,
      })

      return c.json(await poolPayload(pool.id), 200)
    },
  )
  .post(
    "/pools/:id/calculate",
    describeRoute({
      description: "Splits the pool between the month's eligible videos",
      responses: {
        200: {
          description: "Calculated",
          content: { "application/json": { schema: resolver(adminPayoutListSchemaResponse) } },
        },
        400: {
          description: "The pool has already been paid",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    async (c) => {
      const { id } = c.req.valid("param")
      const pool = await fetchMarketingPayoutPool(db).getOne(id)
      if (!pool) return throwNotFound(c, "No such pool")
      // Recalculating after money has moved would rewrite what somebody was actually paid.
      if (pool.status === "paid") {
        return throwBadRequest(c, "That pool has already been paid; it cannot be recalculated")
      }

      // pool.month is "YYYY-MM-01"; the range the videos are compared against is timestamptz
      // and must be UTC, so it is rebuilt from the month key rather than reused from the row.
      const start = monthStart(pool.month.slice(0, 7))
      if (start === null) return throwBadRequest(c, "That pool has an unreadable month")
      const eligible = await fetchMarketingVideo(db).eligibleForMonth(
        pool.businessId,
        start,
        monthEnd(start),
      )

      const shares = splitPool(
        pool.poolUsdCents,
        eligible.map((video) => ({
          videoId: video.id,
          userId: video.submitterUserId,
          weightedViews: video.weightedViews ?? 0,
        })),
      )

      await crudMarketingPayout(db).replaceForPool(
        id,
        shares.filter((share) => share.grossUsdCents > 0),
      )
      await crudMarketingPayoutPool(db).update(id, { status: "locked", computedAt: new Date() })

      return c.json(await poolPayload(id), 200)
    },
  )
  .get(
    "/pools/:id/payouts",
    describeRoute({
      description: "The calculated payouts for a pool",
      responses: {
        200: {
          description: "Payouts",
          content: { "application/json": { schema: resolver(adminPayoutListSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    async (c) => c.json(await poolPayload(c.req.valid("param").id), 200),
  )
  .post(
    "/pools/:id/pay",
    describeRoute({
      description: "Sends every pending payout in the pool through Stripe",
      responses: {
        200: {
          description: "Payouts attempted",
          content: { "application/json": { schema: resolver(adminPayoutListSchemaResponse) } },
        },
        503: {
          description: "Payouts are not configured on this deployment",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    async (c) => {
      const { id } = c.req.valid("param")
      const client = stripe()
      if (!client) {
        return throwError(
          c,
          503,
          ErrorCode.ServiceUnavailable,
          "Payouts are not configured on this deployment",
        )
      }

      const pool = await fetchMarketingPayoutPool(db).getOne(id)
      if (!pool) return throwNotFound(c, "No such pool")

      const payouts = await fetchMarketingPayout(db).listForPool(id)
      const destinations = await fetchPayoutAccount(db).payableAccountsFor(
        payouts.map((payout) => payout.userId),
      )

      let sent = 0
      let outstanding = 0

      for (const payout of payouts) {
        // Never re-send one that already moved: `recordTransfer` guards the write, and this
        // guards the API call, which is the half that actually costs money.
        if (payout.status === "paid") {
          sent += 1
          continue
        }
        if (payout.netUsdCents <= 0) {
          // Nothing to retry: this one can never become payable.
          await crudMarketingPayout(db).update(payout.id, {
            status: "skipped",
            failureReason: "Nothing left after fees",
          })
          continue
        }

        const destination = destinations.get(payout.userId)
        if (!destination) {
          await crudMarketingPayout(db).update(payout.id, {
            status: "skipped",
            failureReason: "Creator has not finished Stripe onboarding",
          })
          // Retryable: they can still connect an account and be paid on a later run.
          outstanding += 1
          continue
        }

        try {
          const transfer = await client.transfers.create(
            {
              amount: payout.netUsdCents,
              currency: "usd",
              destination,
              description: `SproutBiz marketing payout — ${payout.businessName}`,
              metadata: { poolId: id, payoutId: payout.id, videoId: payout.videoId },
            },
            // Stripe deduplicates on this key, so a retried Pay press cannot double-send
            // even if our own write failed after the transfer went through.
            { idempotencyKey: `marketing-payout-${payout.id}` },
          )
          await crudMarketingPayout(db).recordTransfer(payout.id, transfer.id)
          await crudMarketingVideo(db).update(payout.videoId, { status: "paid" })
          sent += 1
        } catch (error) {
          await crudMarketingPayout(db).update(payout.id, {
            status: "failed",
            failureReason: error instanceof Error ? error.message : "Stripe transfer failed",
          })
          outstanding += 1
        }
      }

      // Only close the pool when there is nothing left to retry. Marking it paid while a
      // creator is still waiting to finish Stripe onboarding would strand their share: the
      // pool would refuse to be recalculated and the button that pays it would be disabled.
      await crudMarketingPayoutPool(db).update(
        id,
        outstanding === 0
          ? { status: "paid", paidAt: new Date() }
          : { status: "locked", paidAt: sent > 0 ? new Date() : null },
      )
      return c.json(await poolPayload(id), 200)
    },
  )

/** The shape every pool-mutating route answers with, so the admin UI only parses one thing. */
async function poolPayload(poolId: string) {
  const pool = await fetchMarketingPayoutPool(db).getOne(poolId)
  const payouts = await fetchMarketingPayout(db).listForPool(poolId)
  const destinations = await fetchPayoutAccount(db).payableAccountsFor(
    payouts.map((payout) => payout.userId),
  )
  return {
    poolId,
    poolUsdCents: pool?.poolUsdCents ?? 0,
    status: pool?.status ?? "draft",
    data: payouts.map((payout) => ({
      id: payout.id,
      videoId: payout.videoId,
      username: payout.username,
      platform: payout.platform,
      url: payout.url,
      viewCount: payout.viewCount,
      weightedViews: payout.weightedViews,
      shareBp: payout.shareBp,
      grossUsdCents: payout.grossUsdCents,
      feeUsdCents: payout.feeUsdCents,
      netUsdCents: payout.netUsdCents,
      status: payout.status,
      failureReason: payout.failureReason,
      paidAt: payout.paidAt?.toISOString() ?? null,
      payable: destinations.has(payout.userId),
    })),
  }
}

export default app
