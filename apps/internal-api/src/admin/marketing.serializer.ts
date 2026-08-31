import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

export const adminVideoSchema = Type.Object({
  id: Type.String(),
  businessId: Type.String(),
  businessName: Type.String(),
  businessSlug: Type.String(),
  submitterUserId: Type.String(),
  submitterUsername: Type.String(),
  platform: Type.String(),
  platformLabel: Type.String(),
  url: Type.String(),
  status: Type.String(),
  rejectionReason: Nullable(Type.String()),
  durationSeconds: Nullable(Type.Number()),
  postedAt: Nullable(Type.String()),
  measureAt: Nullable(Type.String()),
  viewCount: Nullable(Type.Number()),
  weightedViews: Nullable(Type.Number()),
  /** The raw view floor this platform has to clear before it earns anything. */
  minViews: Type.Number(),
  meetsMinimum: Type.Boolean(),
  submittedAt: Type.String(),
})

export const adminVideoListSchemaResponse = Type.Object({ data: Type.Array(adminVideoSchema) })

export const adminVideoSchemaResponse = Type.Object({ data: adminVideoSchema })

export const adminVideoQuerySchemaRequest = Type.Object({
  status: Type.Optional(
    Type.Union([
      Type.Literal("pending"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
      Type.Literal("measured"),
      Type.Literal("paid"),
    ]),
  ),
})

export const adminVideoApproveSchemaRequest = Type.Object({
  /** When the video was created. The 30-day counting window runs from here. */
  postedAt: Type.String({ format: "date-time" }),
  durationSeconds: Type.Integer({ minimum: 1, maximum: 36_000 }),
})

export const adminVideoRejectSchemaRequest = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 500 }),
})

export const adminVideoViewsSchemaRequest = Type.Object({
  viewCount: Type.Integer({ minimum: 0 }),
})

export const adminPoolSchema = Type.Object({
  businessId: Type.String(),
  businessName: Type.String(),
  businessSlug: Type.String(),
  month: Type.String(),
  poolId: Nullable(Type.String()),
  revenueUsdCents: Type.Number(),
  costUsdCents: Type.Number(),
  netUsdCents: Type.Number(),
  /** 20% of net profit, floored at zero. What the program promises, before the typed override. */
  suggestedUsdCents: Type.Number(),
  poolUsdCents: Type.Number(),
  notes: Nullable(Type.String()),
  status: Type.String(),
  eligibleVideoCount: Type.Number(),
  totalWeightedViews: Type.Number(),
})

export const adminPoolListSchemaResponse = Type.Object({ data: Type.Array(adminPoolSchema) })

export const adminPoolQuerySchemaRequest = Type.Object({
  month: Type.String({ pattern: "^\\d{4}-\\d{2}$" }),
})

export const adminPoolSetSchemaRequest = Type.Object({
  businessId: UUID7String,
  month: Type.String({ pattern: "^\\d{4}-\\d{2}$" }),
  poolUsdCents: Type.Integer({ minimum: 0 }),
  notes: Type.Optional(Nullable(Type.String({ maxLength: 1000 }))),
})

export const adminPayoutSchema = Type.Object({
  id: Type.String(),
  videoId: Type.String(),
  username: Type.String(),
  platform: Type.String(),
  url: Type.String(),
  viewCount: Nullable(Type.Number()),
  weightedViews: Type.Number(),
  shareBp: Type.Number(),
  grossUsdCents: Type.Number(),
  feeUsdCents: Type.Number(),
  netUsdCents: Type.Number(),
  status: Type.String(),
  failureReason: Nullable(Type.String()),
  paidAt: Nullable(Type.String()),
  /** False when this creator has not finished Stripe onboarding, so we cannot pay them yet. */
  payable: Type.Boolean(),
})

export const adminPayoutListSchemaResponse = Type.Object({
  poolId: Type.String(),
  poolUsdCents: Type.Number(),
  status: Type.String(),
  data: Type.Array(adminPayoutSchema),
})
