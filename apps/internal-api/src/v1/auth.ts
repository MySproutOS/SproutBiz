import { db } from "@template-nextjs/db"
import { Hono } from "hono"
import { deleteCookie } from "hono/cookie"
import { describeRoute } from "hono-typebox-openapi"
import { resolver } from "hono-typebox-openapi/typebox"
import { Type } from "typebox"
import { authMiddleware, authNoThrowMiddleware } from "../middleware"
import { EmptyObject, ErrorSchemaResponse, Nullable } from "../utils/common.serializer"
import { ErrorCode } from "../utils/errors.enum"
import { throwError } from "../utils/http-exception"
import { SESSION_COOKIE_NAME } from "@utils/cookies"

const AuthMeResponseT = Type.Object({
  user: Nullable(
    Type.Object({
      id: Type.String(),
      name: Nullable(Type.String()),
      email: Type.String(),
      isAdmin: Type.Boolean(),
    }),
  ),
  /** Which credential authenticated this request, so an agent can confirm its token is
   *  actually in use rather than silently falling back to a browser session. */
  authMethod: Type.Union([
    Type.Literal("session"),
    Type.Literal("token"),
    Type.Literal("oauth"),
    Type.Literal("none"),
  ]),
  /** Scopes carried by the bearer token, empty for a browser session (which is unscoped). */
  scopes: Type.Array(Type.String()),
})

const app = new Hono()
  .get(
    "/me",
    authNoThrowMiddleware,
    describeRoute({
      responses: {
        200: {
          description: "Current authenticated user or null",
          content: {
            "application/json": {
              schema: resolver(AuthMeResponseT),
            },
          },
        },
      },
    }),
    (c) => {
      const user = c.var.user
      const agentToken = c.var.agentToken
      const oauthToken = c.var.oauthToken
      const authMethod =
        user === null
          ? "none"
          : agentToken !== null
            ? "token"
            : oauthToken !== null
              ? "oauth"
              : "session"
      return c.json(
        { user: user ?? null, authMethod, scopes: agentToken?.scopes ?? oauthToken?.scopes ?? [] },
        200,
      )
    },
  )
  .use(authMiddleware)
  .post(
    "/logout",
    describeRoute({
      responses: {
        200: {
          description: "Successfully logged out",
          content: {
            "application/json": {
              schema: resolver(EmptyObject),
            },
          },
        },
        500: {
          description: "",
          content: {
            "application/json": {
              schema: resolver(ErrorSchemaResponse),
            },
          },
        },
      },
    }),
    async (c) => {
      const session = c.var.session
      // Bearer tokens have no session to end. Revoking the token is the equivalent, and it
      // is deliberately a separate, session-authenticated action.
      if (session === null) {
        return throwError(
          c,
          400,
          ErrorCode.BadRequest,
          "Bearer tokens cannot be logged out; revoke the token instead",
        )
      }
      await db.deleteFrom("session").where("sessionKey", "=", session.sessionKey).execute()
      deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" })
      return c.json({}, 200)
    },
  )

export default app
