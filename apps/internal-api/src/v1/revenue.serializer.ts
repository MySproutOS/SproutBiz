import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

export const revenueSummarySchemaResponse = Type.Object({
  totalRevenueUsdCents: Type.Number(),
  totalCostUsdCents: Type.Number(),
  netUsdCents: Type.Number(),
  businessCount: Type.Number(),
  /** Null until the aggregation job has run for the first time. */
  asOf: Nullable(Type.String({ format: "date-time" })),
})

const businessTotalsSchema = Type.Object({
  id: UUID7String,
  name: Type.String(),
  slug: Type.String(),
  tagline: Nullable(Type.String()),
  url: Nullable(Type.String()),
  repoUrl: Nullable(Type.String()),
  platform: Type.String(),
  status: Type.String(),
  launchedAt: Nullable(Type.String({ format: "date-time" })),
  revenueUsdCents: Type.Number(),
  costUsdCents: Type.Number(),
  netUsdCents: Type.Number(),
  /** False when any figure was self-reported rather than synced from a payment provider. */
  verified: Type.Boolean(),
})

export const revenueBusinessSchemaResponse = Type.Object({
  data: Type.Array(businessTotalsSchema),
})

export const businessDetailSchemaResponse = Type.Object({
  business: businessTotalsSchema,
  periods: Type.Array(
    Type.Object({
      periodStart: Type.String(),
      periodEnd: Type.String(),
      source: Type.String(),
      usdNetCents: Type.Number(),
    }),
  ),
  costs: Type.Array(Type.Object({ category: Type.String(), usdAmountCents: Type.Number() })),
})

export const businessSchemaRequest = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  slug: Type.String({ minLength: 1, maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
  tagline: Type.Optional(Type.String({ maxLength: 200 })),
  description: Type.Optional(Type.String({ maxLength: 5000 })),
  url: Type.Optional(Type.String({ maxLength: 500 })),
  repoUrl: Type.Optional(Type.String({ maxLength: 500 })),
  platform: Type.Optional(
    Type.Union([Type.Literal("web"), Type.Literal("ios"), Type.Literal("android")]),
  ),
})

export const businessCreatedSchemaResponse = Type.Object({
  id: UUID7String,
  name: Type.String(),
  slug: Type.String(),
})

/** Self-reported figures. Recorded with source "manual" so they can be labelled as such. */
export const businessRevenueReportSchemaRequest = Type.Object({
  periodStart: Type.String({ minLength: 10, maxLength: 10 }),
  periodEnd: Type.String({ minLength: 10, maxLength: 10 }),
  usdNetCents: Type.Integer({ minimum: 0 }),
})

export const businessCostReportSchemaRequest = Type.Object({
  periodStart: Type.String({ minLength: 10, maxLength: 10 }),
  periodEnd: Type.String({ minLength: 10, maxLength: 10 }),
  category: Type.Union([
    Type.Literal("infra"),
    Type.Literal("llm"),
    Type.Literal("ads"),
    Type.Literal("payments"),
    Type.Literal("other"),
  ]),
  usdAmountCents: Type.Integer({ minimum: 0 }),
})
