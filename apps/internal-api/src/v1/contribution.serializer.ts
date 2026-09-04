import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

export const contributionSubmissionSchemaRequest = Type.Object({
  type: Type.Union([Type.Literal("idea"), Type.Literal("feedback"), Type.Literal("validation")]),
  businessId: Type.Optional(Nullable(UUID7String)),
  postId: Type.Optional(Nullable(UUID7String)),
  feedbackSubmissionId: Type.Optional(Nullable(UUID7String)),
  evidence: Type.Record(Type.String(), Type.Unknown()),
})

export const contributionSubmissionSchema = Type.Object({
  id: UUID7String,
  type: Type.String(),
  businessId: Nullable(UUID7String),
  postId: Nullable(UUID7String),
  feedbackSubmissionId: Nullable(UUID7String),
  status: Type.String(),
  reviewReason: Nullable(Type.String()),
  createdAt: Type.String({ format: "date-time" }),
})

export const contributionSubmissionSchemaResponse = Type.Object({
  data: contributionSubmissionSchema,
})

export const pendingFeedbackSchemaResponse = Type.Object({
  data: Type.Array(
    Type.Object({
      id: UUID7String,
      businessId: UUID7String,
      businessName: Type.String(),
      businessSlug: Type.String(),
      submittedBy: Type.String(),
      evidence: Type.Record(Type.String(), Type.Unknown()),
      createdAt: Type.String({ format: "date-time" }),
    }),
  ),
})

export const contributionProfileSchemaResponse = Type.Object({
  totalPoints: Type.Number(),
  github: Nullable(
    Type.Object({
      userId: Type.String(),
      login: Type.String(),
      verifiedAt: Type.String({ format: "date-time" }),
    }),
  ),
  byBusiness: Type.Array(
    Type.Object({
      businessId: UUID7String,
      businessName: Type.String(),
      points: Type.Number(),
    }),
  ),
  awards: Type.Array(
    Type.Object({
      id: UUID7String,
      businessId: UUID7String,
      type: Type.String(),
      points: Type.Number(),
      reason: Type.String(),
      createdAt: Type.String({ format: "date-time" }),
    }),
  ),
  submissions: Type.Array(contributionSubmissionSchema),
})
