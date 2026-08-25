import { crudAgentToken, fetchAgentToken } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import {
  agentTokenSchemaRequest,
  agentTokenSchemaResponse,
  agentTokenCreatedSchemaResponse,
} from "./agent-token.serializer"
import { authMiddleware, cookieSessionOnlyMiddleware } from "../middleware"
import { agentTokenDisplayPrefix, generateAgentToken, hashAgentToken } from "../utils/agent-token"
import { EmptyObject, ErrorSchemaResponse, IdParamT } from "../utils/common.serializer"
import { throwNotFound } from "../utils/http-exception"
import { DEFAULT_AGENT_TOKEN_SCOPES, serializeScopes } from "../utils/scopes"

const LIST_FIELDS = [
  "id",
  "name",
  "tokenPrefix",
  "scopes",
  "expiresAt",
  "lastUsedAt",
  "revokedAt",
  "createdAt",
] as const

type TokenRow = {
  id: string
  name: string
  tokenPrefix: string
  scopes: string
  expiresAt: Date | null
  lastUsedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

function serialize(row: TokenRow) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes.split(" ").filter((s) => s.length > 0),
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

// Every route here is cookie-session only: a bearer token that could mint or revoke tokens
// would make a single leak self-perpetuating and impossible to contain by revocation.
const app = new Hono()
  .use(authMiddleware)
  .use(cookieSessionOnlyMiddleware)
  .get(
    "/",
    describeRoute({
      description: "Lists the agent API tokens belonging to the current user",
      responses: {
        200: {
          description: "The user's agent tokens, newest first",
          content: { "application/json": { schema: resolver(agentTokenSchemaResponse) } },
        },
        403: {
          description: "Agent tokens cannot manage tokens",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const rows = await fetchAgentToken(db).listByUserId(c.var.user.id, [...LIST_FIELDS])
      return c.json({ data: rows.map(serialize) }, 200)
    },
  )
  .post(
    "/",
    describeRoute({
      description: "Creates an agent API token. The raw token is returned exactly once.",
      responses: {
        201: {
          description: "The created token, including the raw secret",
          content: { "application/json": { schema: resolver(agentTokenCreatedSchemaResponse) } },
        },
        403: {
          description: "Agent tokens cannot mint tokens",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", agentTokenSchemaRequest),
    async (c) => {
      const body = c.req.valid("json")
      const token = generateAgentToken()
      const expiresAt =
        body.expiresInDays === undefined
          ? null
          : new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000)

      const row = await crudAgentToken(db).create({
        userId: c.var.user.id,
        name: body.name,
        tokenHash: hashAgentToken(token),
        tokenPrefix: agentTokenDisplayPrefix(token),
        scopes: serializeScopes(body.scopes ?? DEFAULT_AGENT_TOKEN_SCOPES),
        expiresAt,
      })

      return c.json({ ...serialize(row), token }, 201)
    },
  )
  .delete(
    "/:id",
    describeRoute({
      description: "Revokes an agent API token",
      responses: {
        200: {
          description: "The token was revoked",
          content: { "application/json": { schema: resolver(EmptyObject) } },
        },
        404: {
          description: "No such token, or it is already revoked",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    async (c) => {
      const { id } = c.req.valid("param")
      const revoked = await crudAgentToken(db).revoke(id, c.var.user.id)
      // Scoped to the caller's own tokens, so a token belonging to someone else is reported
      // as missing rather than forbidden -- it must not be probeable.
      if (!revoked) return throwNotFound(c, "Token not found")
      return c.json({}, 200)
    },
  )

export default app
