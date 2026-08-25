import type { SessionUser } from "@lib/dao/user/auth"
import type { DB } from "@template-nextjs/db"
import { createMiddleware } from "hono/factory"
import { HTTPException } from "hono/http-exception"
import type { Selectable } from "kysely"
import { resolveAuth } from "../middleware"

export const adminAuthMiddleware = createMiddleware<{
  Variables: {
    user: SessionUser
    session: Selectable<DB["session"]>
  }
}>(async (c, next) => {
  const principal = await resolveAuth(c)
  // Admin endpoints are browser-session only. Agent tokens are handed out to third-party
  // agents, and no scope on one should ever add up to administering the forum.
  if (principal.agentToken !== null || principal.session === null) {
    throw new HTTPException(403)
  }
  if (!principal.user.isAdmin) {
    throw new HTTPException(403)
  }
  c.set("user", principal.user)
  c.set("session", principal.session)

  await next()
})
