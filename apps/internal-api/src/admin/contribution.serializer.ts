import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

const submission = Type.Object({
  id: UUID7String,
  userId: UUID7String,
  username: Type.String(),
  businessId: Nullable(UUID7String),
  businessName: Nullable(Type.String()),
  postId: Nullable(UUID7String),
  feedbackSubmissionId: Nullable(UUID7String),
  feedbackSubmittedBy: Nullable(Type.String()),
  feedbackEvidence: Nullable(Type.Record(Type.String(), Type.Unknown())),
  evidence: Type.Record(Type.String(), Type.Unknown()),
  type: Type.String(),
  status: Type.String(),
  createdAt: Type.String({ format: "date-time" }),
})

const codeMonth = Type.Object({
  id: UUID7String,
  userId: UUID7String,
  username: Type.String(),
  businessId: UUID7String,
  businessName: Type.String(),
  periodStart: Type.String(),
  mergedPrCount: Type.Number(),
  additions: Type.Number(),
  deletions: Type.Number(),
  changedFiles: Type.Number(),
  proposedPoints: Nullable(Type.Number()),
  proposedReason: Nullable(Type.String()),
  pullRequests: Type.Array(
    Type.Object({
      id: Type.String(),
      number: Type.Number(),
      title: Type.String(),
      url: Type.String(),
      additions: Type.Number(),
      deletions: Type.Number(),
      changedFiles: Type.Number(),
      labels: Type.Array(Type.String()),
    }),
  ),
})

export const adminContributionReviewSchemaResponse = Type.Object({
  submissions: Type.Array(submission),
  codeMonths: Type.Array(codeMonth),
})

export const adminAcceptIdeaSchemaRequest = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  slug: Type.String({ minLength: 1, maxLength: 80, pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }),
  communityName: Type.String({ minLength: 3, maxLength: 21, pattern: "^[A-Za-z0-9_]+$" }),
  repositoryName: Type.String({
    minLength: 1,
    maxLength: 100,
    pattern: "^[A-Za-z0-9._-]+$",
  }),
  tagline: Type.Optional(Nullable(Type.String({ maxLength: 200 }))),
  description: Type.Optional(Nullable(Type.String({ maxLength: 5000 }))),
  platform: Type.Optional(
    Type.Union([Type.Literal("web"), Type.Literal("ios"), Type.Literal("android")]),
  ),
})

export const adminAcceptContributionSchemaRequest = Type.Object({
  points: Type.Integer({ minimum: 1, maximum: 10 }),
  reason: Type.String({ minLength: 1, maxLength: 1000 }),
})

export const adminRejectContributionSchemaRequest = Type.Object({
  reason: Type.String({ minLength: 1, maxLength: 1000 }),
})

export const adminContributionAwardSchemaResponse = Type.Object({
  awardId: UUID7String,
  points: Type.Number(),
  provisioningId: Type.Optional(UUID7String),
})
