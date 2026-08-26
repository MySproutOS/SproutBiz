import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import type { Context, MiddlewareHandler } from "hono"
import { getCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { Redis } from "ioredis"
import { hashAgentToken, parseBearerToken } from "./agent-token"
import { ErrorCode } from "./errors.enum"
import { throwTooManyRequests } from "./http-exception"
import { SESSION_COOKIE_NAME } from "@utils/cookies"

/**
 * Fixed-window rate limiting backed by Valkey.
 *
 * A fixed window can allow up to 2x the limit across a window boundary. That is accepted
 * deliberately: the alternative (sliding window / token bucket) costs a sorted set and more
 * round trips per request, and the point here is to stop runaway agent loops, not to police
 * an exact rate.
 */

// Mirrors packages/db and lib/typescript/utils/queues: modules that read env load the
// repo-root .env themselves, so they work under vitest and any other non-Next entrypoint.
const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${currentDir}/../../../../.env`, quiet: true })

let client: Redis | null = null

function redis(): Redis {
  client ??= new Redis(process.env.VALKEY_URL ?? "redis://localhost:6379", {
    // The limiter must never become the reason a request hangs: give up quickly and let the
    // caller fail open rather than retrying into a stall.
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    // Left enabled (the default) on purpose. With the offline queue off, every command issued
    // during the initial connect throws, so a cold process would skip rate limiting entirely
    // for its first requests -- precisely when a restart loop is most likely to hammer us.
    // Queued commands still fail fast via maxRetriesPerRequest when Valkey is truly down.
    enableOfflineQueue: true,
  })
  client.on("error", () => {
    // Swallowed: an unreachable Valkey is handled per-request by failing open below.
    // Without a handler, ioredis emits an unhandled 'error' event and crashes the process.
  })
  return client
}

export type RateLimitTier = {
  limit: number
  windowSec: number
}

/**
 * Who the budget belongs to.
 *
 * Budgets are per token rather than per user, so one runaway agent cannot spend its owner's
 * whole allowance. The token is identified by hashing the Authorization header directly
 * rather than by reading the resolved principal: this middleware runs ahead of auth, and a
 * hash is enough to bucket by, with no database round trip. An invalid token therefore gets
 * its own bucket and is still rejected by auth immediately afterwards.
 */
function principalKey(c: Context): string {
  const bearer = parseBearerToken(c.req.header("Authorization"))
  if (bearer !== null) return `t:${hashAgentToken(bearer)}`

  const session = getCookie(c, SESSION_COOKIE_NAME)
  if (session) return `s:${hashAgentToken(session)}`

  const ip =
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ?? c.req.header("X-Real-IP") ?? "unknown"
  return `ip:${ip}`
}

export async function consume(
  key: string,
  tier: RateLimitTier,
): Promise<{ allowed: boolean; remaining: number; resetSec: number }> {
  const windowStart = Math.floor(Date.now() / 1000 / tier.windowSec) * tier.windowSec
  const redisKey = `rl:${key}:${windowStart}`
  const resetSec = windowStart + tier.windowSec

  try {
    const [[, countRaw]] = (await redis()
      .multi()
      .incr(redisKey)
      .expire(redisKey, tier.windowSec)
      .exec()) as [[Error | null, unknown], [Error | null, unknown]]
    const count = Number(countRaw)
    return {
      allowed: count <= tier.limit,
      remaining: Math.max(0, tier.limit - count),
      resetSec,
    }
  } catch {
    // Fail open. Valkey being down should degrade rate limiting, not take the API with it.
    return { allowed: true, remaining: tier.limit, resetSec }
  }
}

export function rateLimit(tier: RateLimitTier, bucket = "default"): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const { allowed, remaining, resetSec } = await consume(`${bucket}:${principalKey(c)}`, tier)

    c.header("X-RateLimit-Limit", String(tier.limit))
    c.header("X-RateLimit-Remaining", String(remaining))
    c.header("X-RateLimit-Reset", String(resetSec))

    if (!allowed) {
      const retryAfter = Math.max(1, resetSec - Math.floor(Date.now() / 1000))
      c.header("Retry-After", String(retryAfter))
      return throwTooManyRequests(
        c,
        "Rate limit exceeded. Honour the Retry-After header.",
        ErrorCode.RateLimitExceeded,
      )
    }

    await next()
    return undefined
  })
}

/** Published in llms.txt, agents.json and the OpenAPI description; keep them in step. */
export const READ_TIER: RateLimitTier = { limit: 600, windowSec: 60 }
export const WRITE_TIER: RateLimitTier = { limit: 120, windowSec: 60 }
export const CREATE_TIER: RateLimitTier = { limit: 20, windowSec: 60 }

export async function closeRateLimiter(): Promise<void> {
  await client?.quit()
  client = null
}
