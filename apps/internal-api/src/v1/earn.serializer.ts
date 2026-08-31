import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

export const earnBusinessSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  slug: Type.String(),
  tagline: Nullable(Type.String()),
  url: Nullable(Type.String()),
  platform: Type.String(),
  status: Type.String(),
  revenueUsdCents: Type.Number(),
  costUsdCents: Type.Number(),
  netUsdCents: Type.Number(),
  /** Videos accepted into the program so far. */
  videoCount: Type.Number(),
  /** Paid out to creators for this business across every month so far. */
  paidOutUsdCents: Type.Number(),
})

export const earnBusinessListSchemaResponse = Type.Object({
  data: Type.Array(earnBusinessSchema),
})

export const earnBusinessQuerySchemaRequest = Type.Object({
  q: Type.Optional(Type.String({ maxLength: 100 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
})

export const earnVideoSubmitSchemaRequest = Type.Object({
  businessId: UUID7String,
  url: Type.String({ minLength: 1, maxLength: 2048 }),
  /** Must be true. The terms set out the split, the timing and the fees. */
  acceptedTerms: Type.Boolean(),
})

export const earnVideoSchema = Type.Object({
  id: Type.String(),
  businessId: Type.String(),
  businessName: Type.String(),
  businessSlug: Type.String(),
  submitterUsername: Type.String(),
  platform: Type.String(),
  url: Type.String(),
  status: Type.String(),
  rejectionReason: Nullable(Type.String()),
  durationSeconds: Nullable(Type.Number()),
  postedAt: Nullable(Type.String()),
  measureAt: Nullable(Type.String()),
  viewCount: Nullable(Type.Number()),
  weightedViews: Nullable(Type.Number()),
  submittedAt: Type.String(),
})

export const earnVideoSchemaResponse = Type.Object({ data: earnVideoSchema })

export const earnVideoListSchemaResponse = Type.Object({ data: Type.Array(earnVideoSchema) })

export const earnPayoutSchema = Type.Object({
  id: Type.String(),
  month: Type.String(),
  businessName: Type.String(),
  businessSlug: Type.String(),
  username: Type.String(),
  platform: Type.String(),
  url: Type.String(),
  viewCount: Nullable(Type.Number()),
  weightedViews: Type.Number(),
  shareBp: Type.Number(),
  grossUsdCents: Type.Number(),
  feeUsdCents: Type.Number(),
  netUsdCents: Type.Number(),
  paidAt: Nullable(Type.String()),
})

export const earnPayoutListSchemaResponse = Type.Object({
  data: Type.Array(earnPayoutSchema),
  totalPaidUsdCents: Type.Number(),
})

export const earnPayoutQuerySchemaRequest = Type.Object({
  month: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}$" })),
})

export const earnEarningsSchemaResponse = Type.Object({
  data: Type.Object({
    /** Calculated and awaiting a payout run. */
    pendingUsdCents: Type.Number(),
    /** Already sent to your Stripe account. */
    paidUsdCents: Type.Number(),
    /** Measured videos whose month has not been calculated yet, so not yet a figure we owe. */
    unsettledVideoCount: Type.Number(),
    termsAcceptedAt: Nullable(Type.String()),
    byMonth: Type.Array(
      Type.Object({
        month: Type.String(),
        businessName: Type.String(),
        grossUsdCents: Type.Number(),
        feeUsdCents: Type.Number(),
        netUsdCents: Type.Number(),
        status: Type.String(),
      }),
    ),
  }),
})
