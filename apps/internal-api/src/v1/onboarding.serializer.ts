import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"

export const ONBOARDING_STEPS = ["token", "install", "verify", "kickoff", "goal", "done"] as const

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

export const onboardingGoalSchemaRequest = Type.Object({
  goal: Type.String({ minLength: 10, maxLength: 2000 }),
})

export const onboardingKickoffSchemaResponse = Type.Object({
  message: Type.String(),
})
