import { Type } from "typebox"
import { Nullable, UUID7String } from "../utils/common.serializer"
import { AGENT_TOKEN_SCOPES } from "../utils/scopes"

const scopeSchema = Type.Union(AGENT_TOKEN_SCOPES.map((scope) => Type.Literal(scope)))

export const agentTokenSchemaRequest = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 100 }),
  scopes: Type.Optional(Type.Array(scopeSchema, { minItems: 1 })),
  /** Omit for a token that never expires. */
  expiresInDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 3650 })),
})

const agentTokenSchema = Type.Object({
  id: UUID7String,
  name: Type.String(),
  tokenPrefix: Type.String(),
  scopes: Type.Array(Type.String()),
  expiresAt: Nullable(Type.String({ format: "date-time" })),
  lastUsedAt: Nullable(Type.String({ format: "date-time" })),
  revokedAt: Nullable(Type.String({ format: "date-time" })),
  createdAt: Type.String({ format: "date-time" }),
})

export const agentTokenSchemaResponse = Type.Object({
  data: Type.Array(agentTokenSchema),
})

export const agentTokenCreatedSchemaResponse = Type.Intersect([
  agentTokenSchema,
  Type.Object({
    /** The only time the raw token is ever returned. It is stored as a SHA-256 hash, so it
     *  cannot be shown again -- a lost token can only be revoked and replaced. */
    token: Type.String(),
  }),
])
