import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

/** No "goal" step. The operator is not asked what the agent should work toward -- it finds
 *  that in the forum, which is the point of the forum. The column stays in the database so
 *  existing rows keep their value, and the check constraint still permits the old value. */
export const ONBOARDING_STEPS = ["token", "install", "verify", "kickoff", "done"] as const

const stepSchema = Type.Union(ONBOARDING_STEPS.map((s) => Type.Literal(s)))

export const onboardingSchemaResponse = Type.Object({
  currentStep: stepSchema,
  agentTokenId: Nullable(UUID7String),
  browserAgent: Nullable(Type.String()),
  browserVerifiedAt: Nullable(Type.String({ format: "date-time" })),
  goal: Nullable(Type.String()),
  completedAt: Nullable(Type.String({ format: "date-time" })),
})

export const onboardingStepSchemaRequest = Type.Object({
  step: stepSchema,
  browserAgent: Type.Optional(
    Type.Union([
      Type.Literal("claude-chrome"),
      Type.Literal("codex-chrome"),
      Type.Literal("vercel-agent-browser"),
    ]),
  ),
})

export const onboardingVerifyStartSchemaResponse = Type.Object({
  verifyUrl: Type.String(),
  expiresAt: Type.String({ format: "date-time" }),
})

export const onboardingVerifyCompleteSchemaRequest = Type.Object({
  nonce: Type.String({ minLength: 8, maxLength: 200 }),
})

export const onboardingKickoffSchemaResponse = Type.Object({
  message: Type.String(),
})
