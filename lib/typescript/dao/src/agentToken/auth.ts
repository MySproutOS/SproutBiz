import type { DB } from "@template-nextjs/db"
import type { Kysely } from "kysely"
import type { SessionUser } from "../user/auth"

/** The token's own identity, carried on the request so scope checks and the
 *  "a token may not mint another token" rule can be enforced downstream. */
export type AgentTokenContext = {
  id: string
  scopes: string[]
  lastUsedAt: Date | null
}

type AgentTokenValidationResult = {
  token: AgentTokenContext
  user: SessionUser
} | null

/** `last_used_at` is written at most once a minute. It is a diagnostic, not an audit trail,
 *  and a write on every authenticated request would double the cost of cheap GETs. */
export function shouldTouchLastUsed(lastUsedAt: Date | null): boolean {
  return lastUsedAt === null || Date.now() - lastUsedAt.getTime() > 60_000
}

export function authAgentToken(db: Kysely<DB>) {
  /** Mirrors authUser().validateSessionToken: takes an already-hashed credential, never the
   *  raw token, so the plaintext never reaches the data layer. */
  async function validateToken(tokenHash: string): Promise<AgentTokenValidationResult> {
    const row = await db
      .selectFrom("agentToken")
      .innerJoin("user", "user.id", "agentToken.userId")
      .where("agentToken.tokenHash", "=", tokenHash)
      .select([
        "agentToken.id as tokenId",
        "agentToken.scopes",
        "agentToken.expiresAt",
        "agentToken.revokedAt",
        "agentToken.lastUsedAt",
        "user.id",
        "user.isAdmin",
        "user.name",
        "user.email",
        "user.suspendedAt",
      ])
      .executeTakeFirst()

    if (!row) return null
    if (row.revokedAt !== null) return null
    // A null expiresAt means the token does not expire.
    if (row.expiresAt !== null && Date.now() >= row.expiresAt.getTime()) return null

    return {
      token: {
        id: row.tokenId,
        scopes: row.scopes.split(" ").filter((s) => s.length > 0),
        lastUsedAt: row.lastUsedAt,
      },
      user: {
        id: row.id,
        isAdmin: row.isAdmin,
        name: row.name,
        email: row.email,
        suspendedAt: row.suspendedAt,
      },
    }
  }

  return { validateToken }
}
