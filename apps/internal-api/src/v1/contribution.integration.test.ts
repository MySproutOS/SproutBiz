import { sha256 } from "@oslojs/crypto/sha2"
import { encodeHexLowerCase } from "@oslojs/encoding"
import { db } from "@template-nextjs/db"
import { SESSION_COOKIE_NAME } from "@utils/cookies"
import { Hono } from "hono"
import { v7 } from "uuid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import contribution from "./contribution"

const suffix = v7().slice(0, 8)
const userId = v7()
const validatorUserId = v7()
const businessId = v7()
const ideasCommunityId = v7()
const otherCommunityId = v7()
const ideaPostId = v7()
const wrongPostId = v7()
const removedPostId = v7()
const sessionToken = `contribution-${v7()}`
const validatorSessionToken = `contribution-validator-${v7()}`
const sessionKey = encodeHexLowerCase(sha256(new TextEncoder().encode(sessionToken)))
const validatorSessionKey = encodeHexLowerCase(
  sha256(new TextEncoder().encode(validatorSessionToken)),
)
const app = new Hono().route("/contribution", contribution)
const cookie = `${SESSION_COOKIE_NAME}=${sessionToken}`
const validatorCookie = `${SESSION_COOKIE_NAME}=${validatorSessionToken}`

beforeAll(async () => {
  await db
    .insertInto("user")
    .values([
      {
        id: userId,
        username: `contrib-${suffix}`,
        email: `contrib-${suffix}@example.invalid`,
      },
      {
        id: validatorUserId,
        username: `validator-${suffix}`,
        email: `validator-${suffix}@example.invalid`,
      },
    ])
    .execute()
  await db
    .insertInto("session")
    .values([
      { sessionKey, userId, expires: new Date(Date.now() + 60_000) },
      {
        sessionKey: validatorSessionKey,
        userId: validatorUserId,
        expires: new Date(Date.now() + 60_000),
      },
    ])
    .execute()
  await db
    .insertInto("business")
    .values({
      id: businessId,
      ownerUserId: userId,
      name: `Validation business ${suffix}`,
      slug: `validation-${suffix}`,
    })
    .execute()
  await db
    .insertInto("community")
    .values([
      {
        id: ideasCommunityId,
        name: "saasideas",
        description: "Reviewable business ideas",
        visibility: "public",
      },
      {
        id: otherCommunityId,
        name: `other_${suffix}`,
        description: "Not the idea review community",
        visibility: "public",
      },
    ])
    .execute()
  await db
    .insertInto("post")
    .values([
      {
        id: ideaPostId,
        authorUserId: userId,
        communityId: ideasCommunityId,
        type: "text",
        title: "A properly researched idea",
      },
      {
        id: wrongPostId,
        authorUserId: userId,
        communityId: otherCommunityId,
        type: "text",
        title: "An idea in the wrong community",
      },
      {
        id: removedPostId,
        authorUserId: userId,
        communityId: ideasCommunityId,
        type: "text",
        title: "A removed idea",
        removedAt: new Date(),
      },
    ])
    .execute()
})

afterAll(async () => {
  await db
    .deleteFrom("contributionSubmission")
    .where("userId", "in", [userId, validatorUserId])
    .execute()
  await db.deleteFrom("post").where("authorUserId", "=", userId).execute()
  await db.deleteFrom("community").where("id", "in", [ideasCommunityId, otherCommunityId]).execute()
  await db.deleteFrom("business").where("id", "=", businessId).execute()
  await db
    .deleteFrom("session")
    .where("sessionKey", "in", [sessionKey, validatorSessionKey])
    .execute()
  await db.deleteFrom("user").where("id", "in", [userId, validatorUserId]).execute()
  await db.destroy()
})

async function submit(postId: string): Promise<Response> {
  return await app.request("/contribution", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "idea", postId, evidence: { source: "integration-test" } }),
  })
}

describe("idea contribution submission", () => {
  it("accepts only a live post in c/saasideas and is idempotent per post", async () => {
    const first = await submit(ideaPostId)
    expect(first.status).toBe(201)
    const firstId = ((await first.json()) as { data: { id: string } }).data.id

    const retry = await submit(ideaPostId)
    expect(retry.status).toBe(201)
    expect(((await retry.json()) as { data: { id: string } }).data.id).toBe(firstId)

    const count = await db
      .selectFrom("contributionSubmission")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("postId", "=", ideaPostId)
      .executeTakeFirstOrThrow()
    expect(String(count.count)).toBe("1")

    expect((await submit(wrongPostId)).status).toBe(400)
    expect((await submit(removedPostId)).status).toBe(400)
  })

  it("exposes pending feedback and records one independent validation per user", async () => {
    const feedbackResponse = await app.request("/contribution", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "feedback",
        businessId,
        evidence: { steps: ["Open the app", "Observe the failure"] },
      }),
    })
    expect(feedbackResponse.status).toBe(201)
    const feedbackId = ((await feedbackResponse.json()) as { data: { id: string } }).data.id

    const pending = await app.request("/contribution/pending-feedback", {
      headers: { Cookie: validatorCookie },
    })
    expect(pending.status).toBe(200)
    expect(
      ((await pending.json()) as { data: Array<{ id: string }> }).data.some(
        (row) => row.id === feedbackId,
      ),
    ).toBe(true)

    const request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "validation",
        businessId,
        feedbackSubmissionId: feedbackId,
        evidence: { reproduced: true, environment: "integration test" },
      }),
    }
    expect(
      (
        await app.request("/contribution", {
          ...request,
          headers: { ...request.headers, Cookie: cookie },
        })
      ).status,
    ).toBe(400)

    const first = await app.request("/contribution", {
      ...request,
      headers: { ...request.headers, Cookie: validatorCookie },
    })
    expect(first.status).toBe(201)
    const firstId = ((await first.json()) as { data: { id: string } }).data.id
    const retry = await app.request("/contribution", {
      ...request,
      headers: { ...request.headers, Cookie: validatorCookie },
    })
    expect(retry.status).toBe(201)
    expect(((await retry.json()) as { data: { id: string } }).data.id).toBe(firstId)
  })
})
