import { authAgentToken, authUser, crudAgentToken, shouldTouchLastUsed } from "@lib/dao"
import type { AgentTokenContext } from "@lib/dao"
import { sha256 } from "@oslojs/crypto/sha2"
import { encodeHexLowerCase } from "@oslojs/encoding"
import type { DB } from "@template-nextjs/db"
import { db } from "@template-nextjs/db"
import type { Context } from "hono"
import { getCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import type { Selectable } from "kysely"
import { hashAgentToken, parseBearerToken } from "./utils/agent-token"
import { ErrorCode } from "./utils/errors.enum"
import { throwHTTPException } from "./utils/http-exception"
import { SESSION_COOKIE_NAME } from "@utils/cookies"

type SessionUser = Pick<Selectable<DB["user"]>, "id" | "isAdmin" | "name" | "email" | "suspendedAt">

/** The resolved caller. Exactly one of `session` / `agentToken` is non-null:
 *  a browser presents a session cookie, an agent presents a bearer token. */
export type AuthPrincipal = {
  user: SessionUser
  session: Selectable<DB["session"]> | null
  agentToken: AgentTokenContext | null
}

type AuthVariables = {
  user: SessionUser
  session: Selectable<DB["session"]> | null
  agentToken: AgentTokenContext | null
}

type AuthNoThrowVariables = {
  user: SessionUser | null
  session: Selectable<DB["session"]> | null
  agentToken: AgentTokenContext | null
}

function assertUsable(user: SessionUser): void {
  if (user.suspendedAt) {
    throwHTTPException(403, ErrorCode.Suspended, "Account suspended")
  }
}

async function resolveBearer(token: string): Promise<AuthPrincipal> {
  let result: Awaited<ReturnType<ReturnType<typeof authAgentToken>["validateToken"]>>
  try {
    result = await authAgentToken(db).validateToken(hashAgentToken(token))
  } catch {
    // Typically this means we're unable to connect to the database
    return throwHTTPException(503, ErrorCode.ServiceUnavailable, "Service unavailable")
  }
  if (!result) throwHTTPException(401, ErrorCode.Unauthenticated, "Invalid or expired token")
  assertUsable(result.user)

  // Fire-and-forget, and throttled inside the DAO: last_used_at is a diagnostic, and a write
  // on every request would add a round trip to otherwise cheap reads.
  if (shouldTouchLastUsed(result.token.lastUsedAt)) {
    void crudAgentToken(db)
      .touchLastUsed(result.token.id, new Date())
      .catch(() => {
        // A missed timestamp is not worth failing the request over.
      })
  }

  return { user: result.user, session: null, agentToken: result.token }
}

async function resolveCookie(sessionToken: string): Promise<AuthPrincipal> {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)))
  let session: Awaited<ReturnType<ReturnType<typeof authUser>["validateSessionToken"]>>
  try {
    session = await authUser(db).validateSessionToken(sessionId)
  } catch {
    // Typically this means we're unable to connect to the database
    return throwHTTPException(503, ErrorCode.ServiceUnavailable, "Service unavailable")
  }
  if (!session) throwHTTPException(401, ErrorCode.Unauthenticated, "Unauthenticated")
  assertUsable(session.user)
  return { user: session.user, session: session.session, agentToken: null }
}

/**
 * Resolves the caller from either credential.
 *
 * A bearer token wins over a session cookie when both are present, so an agent driving a
 * browser that happens to be logged in still acts as itself rather than silently borrowing
 * the human's session.
 */
export async function resolveAuth(c: Context): Promise<AuthPrincipal> {
  const bearer = parseBearerToken(c.req.header("Authorization"))
  if (bearer !== null) return await resolveBearer(bearer)

  const sessionToken = getCookie(c, SESSION_COOKIE_NAME)
  if (!sessionToken) {
    throwHTTPException(401, ErrorCode.Unauthenticated, "Unauthenticated")
  }
  return await resolveCookie(sessionToken)
}

/**
 * The baseline scope a request needs, derived from its method.
 *
 * Enforced here rather than route-by-route so that every one of the ~40 v1 resources is
 * covered by construction and a new route cannot forget to opt in. Routes needing something
 * narrower add `requireScope` on top.
 */
function requiredScopeForMethod(method: string): string {
  return method === "GET" || method === "HEAD" ? "forum:read" : "forum:write"
}

export const authMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const principal = await resolveAuth(c)

  if (principal.agentToken !== null) {
    const needed = requiredScopeForMethod(c.req.method)
    if (!principal.agentToken.scopes.includes(needed)) {
      throwHTTPException(
        403,
        ErrorCode.InsufficientPermissions,
        `This token is missing the "${needed}" scope`,
      )
    }
  }

  c.set("user", principal.user)
  c.set("session", principal.session)
  c.set("agentToken", principal.agentToken)

  await next()
})

export const authNoThrowMiddleware = createMiddleware<{ Variables: AuthNoThrowVariables }>(
  async (c, next) => {
    try {
      const principal = await resolveAuth(c)
      c.set("user", principal.user)
      c.set("session", principal.session)
      c.set("agentToken", principal.agentToken)
    } catch (e) {
      if (e instanceof HTTPException && e.status === 401) {
        c.set("user", null)
        c.set("session", null)
        c.set("agentToken", null)
      } else {
        throw e
      }
    }

    await next()
  },
)

/**
 * Restricts a route to browser sessions.
 *
 * Two kinds of route need this. Token management, because a bearer token that could mint or
 * revoke tokens would make a single leak self-perpetuating and impossible to contain by
 * revocation. And the onboarding browser check, whose whole premise is that the nonce is
 * visible only to a signed-in browser.
 */
export const cookieSessionOnlyMiddleware = createMiddleware<{ Variables: AuthVariables }>(
  async (c, next) => {
    if (c.var.agentToken !== null) {
      throwHTTPException(
        403,
        ErrorCode.Forbidden,
        "This endpoint requires a signed-in browser session, not an agent token",
      )
    }
    await next()
  },
)

/**
 * Requires a scope of a bearer token. Session cookies represent the user acting directly and
 * are unscoped, so they pass through.
 */
export function requireScope(scope: string) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const agentToken = c.var.agentToken
    if (agentToken !== null && !agentToken.scopes.includes(scope)) {
      throwHTTPException(
        403,
        ErrorCode.InsufficientPermissions,
        `This token is missing the "${scope}" scope`,
      )
    }
    await next()
  })
}
