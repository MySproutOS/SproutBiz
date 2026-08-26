import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

/** `username` is here because it is the only handle that addresses a user in a URL -- `name` is a
 *  display name and, for accounts created through OAuth, is often just their email address. Any
 *  surface that links to a profile needs this, and re-querying for one column would be silly. */
export type SessionUser = Pick<
  Selectable<DB["user"]>,
  "id" | "isAdmin" | "name" | "username" | "email" | "suspendedAt"
>

type SessionValidationResult = {
  session: Selectable<DB["session"]>
  user: SessionUser
} | null

export function authUser(db: Kysely<DB>) {
  async function validateSessionToken(sessionKey: string): Promise<SessionValidationResult> {
    const row = await db
      .selectFrom("session")
      .innerJoin("user", "user.id", "session.userId")
      .where("session.sessionKey", "=", sessionKey)
      .select([
        "session.sessionKey",
        "session.expires",
        "session.userId",
        "user.id",
        "user.isAdmin",
        "user.name",
        "user.username",
        "user.email",
        "user.suspendedAt",
      ])
      .executeTakeFirst()

    if (!row) {
      return null
    }
    const session: Selectable<DB["session"]> = {
      sessionKey: row.sessionKey,
      userId: row.userId,
      expires: row.expires,
    }
    const user: SessionUser = {
      id: row.id,
      isAdmin: row.isAdmin,
      name: row.name,
      username: row.username,
      email: row.email,
      suspendedAt: row.suspendedAt,
    }
    if (Date.now() >= session.expires.getTime()) {
      await db.deleteFrom("session").where("sessionKey", "=", session.sessionKey).execute()
      return null
    }
    if (Date.now() >= session.expires.getTime() - 1000 * 60 * 60 * 24 * 15) {
      session.expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      await db
        .updateTable("session")
        .set("expires", session.expires)
        .where("sessionKey", "=", session.sessionKey)
        .execute()
    }
    return { session, user }
  }

  return { validateSessionToken }
}
