import {
  crudMarketingVideo,
  crudUser,
  fetchBusiness,
  fetchMarketingPayout,
  fetchMarketingVideo,
  fetchUser,
  type MarketingPayoutRow,
  type MarketingVideoRow,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import { isParsedVideo, monthDateString, monthStart, parseVideoUrl } from "@utils/marketing"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { authMiddleware, authNoThrowMiddleware } from "../middleware"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { ErrorCode } from "../utils/errors.enum"
import { throwError, throwNotFound } from "../utils/http-exception"
import {
  earnBusinessListSchemaResponse,
  earnEarningsSchemaResponse,
  earnBusinessQuerySchemaRequest,
  earnPayoutListSchemaResponse,
  earnPayoutQuerySchemaRequest,
  earnVideoListSchemaResponse,
  earnVideoSchemaResponse,
  earnVideoSubmitSchemaRequest,
} from "./earn.serializer"

function serializeVideo(row: MarketingVideoRow) {
  return {
    id: row.id,
    businessId: row.businessId,
    businessName: row.businessName,
    businessSlug: row.businessSlug,
    submitterUsername: row.submitterUsername,
    platform: row.platform,
    url: row.url,
    status: row.status,
    rejectionReason: row.rejectionReason,
    durationSeconds: row.durationSeconds,
    postedAt: row.postedAt?.toISOString() ?? null,
    measureAt: row.measureAt?.toISOString() ?? null,
    viewCount: row.viewCount,
    weightedViews: row.weightedViews,
    submittedAt: row.submittedAt.toISOString(),
  }
}

function serializePayout(row: MarketingPayoutRow) {
  return {
    id: row.id,
    month: row.month,
    businessName: row.businessName,
    businessSlug: row.businessSlug,
    username: row.username,
    platform: row.platform,
    url: row.url,
    viewCount: row.viewCount,
    weightedViews: row.weightedViews,
    shareBp: row.shareBp,
    grossUsdCents: row.grossUsdCents,
    feeUsdCents: row.feeUsdCents,
    netUsdCents: row.netUsdCents,
    paidAt: row.paidAt?.toISOString() ?? null,
  }
}

const app = new Hono()
  .get(
    "/businesses",
    authNoThrowMiddleware,
    describeRoute({
      description: "Businesses you can submit a marketing video for, searchable by name",
      responses: {
        200: {
          description: "Businesses",
          content: { "application/json": { schema: resolver(earnBusinessListSchemaResponse) } },
        },
      },
    }),
    validator("query", earnBusinessQuerySchemaRequest),
    async (c) => {
      const { q, limit } = c.req.valid("query")
      const businesses = await fetchBusiness(db).listWithTotals(limit ?? 100, q)
      // One round trip for the per-business counts rather than one per business.
      const counts = await fetchMarketingVideo(db).countsByBusiness(businesses.map((b) => b.id))
      return c.json({
        data: businesses.map((business) => ({
          id: business.id,
          name: business.name,
          slug: business.slug,
          tagline: business.tagline,
          url: business.url,
          platform: business.platform,
          status: business.status,
          revenueUsdCents: business.revenueUsdCents,
          costUsdCents: business.costUsdCents,
          netUsdCents: business.netUsdCents,
          videoCount: counts.get(business.id)?.videoCount ?? 0,
          paidOutUsdCents: counts.get(business.id)?.paidOutUsdCents ?? 0,
        })),
      })
    },
  )
  .get(
    "/payouts",
    authNoThrowMiddleware,
    describeRoute({
      description: "Every marketing payout that has actually been sent",
      responses: {
        200: {
          description: "Payouts",
          content: { "application/json": { schema: resolver(earnPayoutListSchemaResponse) } },
        },
      },
    }),
    validator("query", earnPayoutQuerySchemaRequest),
    async (c) => {
      const { month } = c.req.valid("query")
      const filter =
        month === undefined || monthStart(month) === null ? undefined : monthDateString(month)
      const [rows, totalPaidUsdCents] = await Promise.all([
        fetchMarketingPayout(db).listPaid(filter),
        fetchMarketingPayout(db).totalPaidUsdCents(),
      ])
      return c.json({ data: rows.map(serializePayout), totalPaidUsdCents })
    },
  )
  .get(
    "/videos/mine",
    authMiddleware,
    describeRoute({
      description: "The videos you have submitted and where each one stands",
      responses: {
        200: {
          description: "Your videos",
          content: { "application/json": { schema: resolver(earnVideoListSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const rows = await fetchMarketingVideo(db).listForUser(c.var.user.id)
      return c.json({ data: rows.map(serializeVideo) })
    },
  )
  .get(
    "/earnings/mine",
    authMiddleware,
    describeRoute({
      description: "What you have earned, what is still pending, and what has been paid",
      responses: {
        200: {
          description: "Your earnings",
          content: { "application/json": { schema: resolver(earnEarningsSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const userId = c.var.user.id
      const [payouts, videos, user] = await Promise.all([
        fetchMarketingPayout(db).listForUser(userId),
        fetchMarketingVideo(db).listForUser(userId),
        fetchUser(db).getOne(userId, ["earnTermsAcceptedAt"]),
      ])

      let pendingUsdCents = 0
      let paidUsdCents = 0
      for (const payout of payouts) {
        if (payout.status === "paid") paidUsdCents += payout.netUsdCents
        // "skipped" is retryable -- usually because Stripe onboarding is unfinished -- so it
        // is still money owed rather than money written off.
        else if (payout.status !== "failed") pendingUsdCents += payout.netUsdCents
      }

      // Measured but not yet in any pool: real views, but no figure we have committed to.
      const settled = new Set(payouts.map((payout) => payout.videoId))
      const unsettledVideoCount = videos.filter(
        (video) => video.status === "measured" && !settled.has(video.id),
      ).length

      return c.json({
        data: {
          pendingUsdCents,
          paidUsdCents,
          unsettledVideoCount,
          termsAcceptedAt: user?.earnTermsAcceptedAt?.toISOString() ?? null,
          byMonth: payouts.map((payout) => ({
            month: payout.month,
            businessName: payout.businessName,
            grossUsdCents: payout.grossUsdCents,
            feeUsdCents: payout.feeUsdCents,
            netUsdCents: payout.netUsdCents,
            status: payout.status,
          })),
        },
      })
    },
  )
  .post(
    "/videos",
    authMiddleware,
    describeRoute({
      description: "Submits a video advertising a business",
      responses: {
        201: {
          description: "Submitted, awaiting review",
          content: { "application/json": { schema: resolver(earnVideoSchemaResponse) } },
        },
        400: {
          description: "The link is not a supported video",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
        409: {
          description: "That video has already been submitted",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", earnVideoSubmitSchemaRequest),
    async (c) => {
      const { businessId, url, acceptedTerms } = c.req.valid("json")

      // Checked server-side, not just in the form. The terms are where the split, the
      // 30-day window and the "payout runs are manual and can be late" promise live, and a
      // claim on money should not be creatable without them.
      if (!acceptedTerms) {
        return throwError(
          c,
          400,
          ErrorCode.InvalidInput,
          "You need to agree to the Earn Money terms before submitting a video.",
        )
      }

      const business = await fetchBusiness(db).getOne(businessId, ["id"])
      if (!business) {
        return throwNotFound(c, "No such business")
      }

      const parsed = parseVideoUrl(url)
      if (!isParsedVideo(parsed)) {
        return throwError(c, 400, ErrorCode.InvalidInput, parsed.reason)
      }

      // Checked here for a friendly message, and again by the unique constraint below,
      // because two people can submit the same link at the same moment.
      const existing = await fetchMarketingVideo(db).findByExternalId(
        parsed.platform,
        parsed.externalId,
      )
      if (existing) {
        return throwError(
          c,
          409,
          ErrorCode.ResourceAlreadyExists,
          "That video has already been submitted. Each video can only be claimed once, by whoever submits it first.",
        )
      }

      let created: Awaited<ReturnType<ReturnType<typeof crudMarketingVideo>["create"]>>
      try {
        created = await crudMarketingVideo(db).create({
          businessId,
          submitterUserId: c.var.user.id,
          platform: parsed.platform,
          externalVideoId: parsed.externalId,
          url,
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          return throwError(
            c,
            409,
            ErrorCode.ResourceAlreadyExists,
            "That video has already been submitted. Each video can only be claimed once, by whoever submits it first.",
          )
        }
        throw error
      }

      // First acceptance wins: this records when they agreed, not the last time they ticked.
      await crudUser(db).recordEarnTermsAcceptance(c.var.user.id)

      const row = await fetchMarketingVideo(db).getRow(created.id)
      if (!row) {
        return throwNotFound(c, "Submission could not be read back")
      }
      return c.json({ data: serializeVideo(row) }, 201)
    },
  )

/** Postgres 23505. The submission race is the only place this is expected. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505"
}

export default app
