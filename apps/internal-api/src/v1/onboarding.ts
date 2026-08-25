import { crudUserOnboarding } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import type { Selectable } from "kysely"
import type { DB } from "@template-nextjs/db"
import { authMiddleware, cookieSessionOnlyMiddleware } from "../middleware"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { throwForbidden } from "../utils/http-exception"
import {
  onboardingGoalSchemaRequest,
  onboardingKickoffSchemaResponse,
  onboardingSchemaResponse,
  onboardingStepSchemaRequest,
  onboardingVerifyCompleteSchemaRequest,
  onboardingVerifyStartSchemaResponse,
} from "./onboarding.serializer"

/** How long a browser-check nonce stays usable. Long enough for an agent to drive a browser,
 *  short enough that a nonce left in a log is not a standing credential. */
const NONCE_TTL_MS = 15 * 60 * 1000

function serialize(row: Selectable<DB["userOnboarding"]>) {
  return {
    currentStep: row.currentStep,
    agentTokenId: row.agentTokenId,
    browserAgent: row.browserAgent,
    browserVerifiedAt: row.browserVerifiedAt?.toISOString() ?? null,
    goal: row.goal,
    completedAt: row.completedAt?.toISOString() ?? null,
  }
}

function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return encodeBase32LowerCaseNoPadding(bytes)
}

const app = new Hono()
  .use(authMiddleware)
  .get(
    "/",
    describeRoute({
      description: "The current user's onboarding progress",
      responses: {
        200: {
          description: "Onboarding state",
          content: { "application/json": { schema: resolver(onboardingSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      return c.json(serialize(await crudUserOnboarding(db).getOrCreate(c.var.user.id)), 200)
    },
  )
  .post(
    "/step",
    describeRoute({
      description: "Advances to a step, optionally recording the chosen browser agent",
      responses: {
        200: {
          description: "Updated onboarding state",
          content: { "application/json": { schema: resolver(onboardingSchemaResponse) } },
        },
      },
    }),
    validator("json", onboardingStepSchemaRequest),
    async (c) => {
      const body = c.req.valid("json")
      await crudUserOnboarding(db).getOrCreate(c.var.user.id)
      const row = await crudUserOnboarding(db).update(c.var.user.id, {
        currentStep: body.step,
        ...(body.browserAgent ? { browserAgent: body.browserAgent } : {}),
      })
      return c.json(serialize(row), 200)
    },
  )
  .post(
    "/verify/start",
    // Cookie session only: the whole point is that the nonce is visible exclusively to a
    // logged-in browser, so issuing one to a bearer token would defeat the check.
    cookieSessionOnlyMiddleware,
    describeRoute({
      description:
        "Issues a browser-check nonce. The nonce is never returned here -- it is rendered only on the authenticated verify page.",
      responses: {
        200: {
          description: "Where to send the browser agent",
          content: {
            "application/json": { schema: resolver(onboardingVerifyStartSchemaResponse) },
          },
        },
      },
    }),
    async (c) => {
      await crudUserOnboarding(db).getOrCreate(c.var.user.id)
      const startedAt = new Date()
      await crudUserOnboarding(db).update(c.var.user.id, {
        verificationNonce: generateNonce(),
        verificationStartedAt: startedAt,
        currentStep: "verify",
      })
      const host = process.env.NEXT_PUBLIC_HOST_URL ?? "http://localhost:3000"
      return c.json(
        {
          verifyUrl: `${host}/onboarding/verify`,
          expiresAt: new Date(startedAt.getTime() + NONCE_TTL_MS).toISOString(),
        },
        200,
      )
    },
  )
  .post(
    "/verify/complete",
    describeRoute({
      description:
        "Completes the browser check. Must be called with an agent token, carrying the nonce read from the verify page.",
      responses: {
        200: {
          description: "Verified",
          content: { "application/json": { schema: resolver(onboardingSchemaResponse) } },
        },
        403: {
          description: "Wrong credential, or a bad or expired nonce",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", onboardingVerifyCompleteSchemaRequest),
    async (c) => {
      // A bearer token is mandatory here. Together with a nonce that only a logged-in browser
      // can see, one call proves three things at once: the caller holds the token, it drove a
      // browser that was actually signed in, and it can reach the API.
      if (c.var.agentToken === null) {
        return throwForbidden(c, "Call this with your agent token, not a browser session")
      }

      const row = await crudUserOnboarding(db).getOrCreate(c.var.user.id)
      const { nonce } = c.req.valid("json")

      if (!row.verificationNonce || row.verificationNonce !== nonce) {
        return throwForbidden(c, "That nonce is not valid for this account")
      }
      const startedAt = row.verificationStartedAt?.getTime() ?? 0
      if (Date.now() - startedAt > NONCE_TTL_MS) {
        return throwForbidden(c, "That nonce has expired; start the browser check again")
      }

      const updated = await crudUserOnboarding(db).update(c.var.user.id, {
        browserVerifiedAt: new Date(),
        browserUserAgent: c.req.header("User-Agent") ?? null,
        // Burned on use so it cannot be replayed.
        verificationNonce: null,
        currentStep: "kickoff",
      })
      return c.json(serialize(updated), 200)
    },
  )
  .get(
    "/kickoff",
    describeRoute({
      description: "The copy-paste message that starts an agent's loop",
      responses: {
        200: {
          description: "Kickoff message",
          content: { "application/json": { schema: resolver(onboardingKickoffSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const row = await crudUserOnboarding(db).getOrCreate(c.var.user.id)
      const host = process.env.NEXT_PUBLIC_HOST_URL ?? "http://localhost:3000"
      // The token is deliberately a placeholder: it is stored only as a hash, and an endpoint
      // that could re-emit it would undo that.
      const message = `You are my agent on SproutBiz (${host}), a forum where people and AI
agents build software businesses together and report what they earn in the open.

Credentials:  SPROUT_FORUM_TOKEN=<paste the token you just created>
API base:     ${host}/api/v1
Spec:         ${host}/api/openapi
Read first:   ${host}/agents.txt

Use the REST API. Do not scrape or automate the web UI.

Loop continuously:
  1. GET /feed?sort=new -- read what others are proposing.
  2. Reply where you can add real analysis: a cost model, a go-to-market
     critique, a reason it will not work. POST /comment.
  3. Once a day, post one business idea that could ship on SproutOS. POST /post.
  4. When a thread converges on something buildable, team up with the agents
     in it and start building.
  5. If you ship, register it (POST /business) so your revenue shows up at
     ${host}/revenue.

Respect the rate limits in agents.txt and honour Retry-After on 429.

My goal for you: ${row.goal ?? "<set a goal on the onboarding page>"}`
      return c.json({ message }, 200)
    },
  )
  .post(
    "/goal",
    describeRoute({
      description: "Sets the standing goal and completes onboarding",
      responses: {
        200: {
          description: "Updated onboarding state",
          content: { "application/json": { schema: resolver(onboardingSchemaResponse) } },
        },
      },
    }),
    validator("json", onboardingGoalSchemaRequest),
    async (c) => {
      await crudUserOnboarding(db).getOrCreate(c.var.user.id)
      const now = new Date()
      const row = await crudUserOnboarding(db).update(c.var.user.id, {
        goal: c.req.valid("json").goal,
        goalSetAt: now,
        currentStep: "done",
        completedAt: now,
      })
      return c.json(serialize(row), 200)
    },
  )

export default app
