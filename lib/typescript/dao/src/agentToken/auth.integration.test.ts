import { db } from "@template-nextjs/db"
import { v7 } from "uuid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { authAgentToken, shouldTouchLastUsed } from "./auth"
import { crudAgentToken } from "./crud"

const suffix = v7().slice(0, 8)
const userId = v7()

/** The DAO is handed an already-hashed credential and never the raw token, so these tests
 *  only need a stable stand-in: what matters is that one input maps to one stored value. */
function hash(token: string): string {
  return `hash-${token}`
}

beforeAll(async () => {
  await db
    .insertInto("user")
    .values({ id: userId, username: `tok-${suffix}`, email: `tok-${suffix}@example.invalid` })
    .execute()
})

afterAll(async () => {
  await db.deleteFrom("agentToken").where("userId", "=", userId).execute()
  await db.deleteFrom("user").where("id", "=", userId).execute()
  await db.destroy()
})

describe("agent token validation", () => {
  it("resolves a live token to its user and scopes", async () => {
    const row = await crudAgentToken(db).create({
      userId,
      name: "live",
      tokenHash: hash(`live-${suffix}`),
      tokenPrefix: "sof_live",
      scopes: "forum:read forum:write",
    })

    const result = await authAgentToken(db).validateToken(hash(`live-${suffix}`))
    expect(result).not.toBeNull()
    expect(result?.user.id).toBe(userId)
    expect(result?.token.id).toBe(row.id)
    expect(result?.token.scopes).toEqual(["forum:read", "forum:write"])
  })

  it("rejects an unknown token", async () => {
    expect(await authAgentToken(db).validateToken(hash("nope"))).toBeNull()
  })

  it("rejects a revoked token", async () => {
    const row = await crudAgentToken(db).create({
      userId,
      name: "revoked",
      tokenHash: hash(`revoked-${suffix}`),
      tokenPrefix: "sof_revk",
      scopes: "forum:read",
    })
    expect(await crudAgentToken(db).revoke(row.id, userId)).toBe(true)
    expect(await authAgentToken(db).validateToken(hash(`revoked-${suffix}`))).toBeNull()
    // Revoking twice is not an error the caller should retry; it simply did nothing.
    expect(await crudAgentToken(db).revoke(row.id, userId)).toBe(false)
  })

  it("rejects an expired token but accepts one with no expiry", async () => {
    await crudAgentToken(db).create({
      userId,
      name: "expired",
      tokenHash: hash(`expired-${suffix}`),
      tokenPrefix: "sof_expd",
      scopes: "forum:read",
      expiresAt: new Date(Date.now() - 1000),
    })
    expect(await authAgentToken(db).validateToken(hash(`expired-${suffix}`))).toBeNull()

    await crudAgentToken(db).create({
      userId,
      name: "forever",
      tokenHash: hash(`forever-${suffix}`),
      tokenPrefix: "sof_frvr",
      scopes: "forum:read",
      expiresAt: null,
    })
    expect(await authAgentToken(db).validateToken(hash(`forever-${suffix}`))).not.toBeNull()
  })

  it("will not revoke a token belonging to someone else", async () => {
    const other = v7()
    await db
      .insertInto("user")
      .values({ id: other, username: `oth-${suffix}`, email: `oth-${suffix}@example.invalid` })
      .execute()
    const row = await crudAgentToken(db).create({
      userId,
      name: "mine",
      tokenHash: hash(`mine-${suffix}`),
      tokenPrefix: "sof_mine",
      scopes: "forum:read",
    })
    expect(await crudAgentToken(db).revoke(row.id, other)).toBe(false)
    expect(await authAgentToken(db).validateToken(hash(`mine-${suffix}`))).not.toBeNull()
    await db.deleteFrom("user").where("id", "=", other).execute()
  })
})

describe("last-used throttling", () => {
  it("writes on first use and then at most once a minute", () => {
    expect(shouldTouchLastUsed(null)).toBe(true)
    expect(shouldTouchLastUsed(new Date(Date.now() - 5_000))).toBe(false)
    expect(shouldTouchLastUsed(new Date(Date.now() - 120_000))).toBe(true)
  })
})
