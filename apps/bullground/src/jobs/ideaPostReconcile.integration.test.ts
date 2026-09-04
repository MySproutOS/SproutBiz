import { db } from "@template-nextjs/db"
import { postSlack } from "@utils/slack"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { reconcileIdeaPosts } from "./ideaPostReconcile"

vi.mock("@utils/slack", () => ({
  mentionOwner: () => "",
  postSlack: vi.fn<(text: string, channel?: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  ),
}))

const suffix = randomUUID().slice(0, 8)
const userId = randomUUID()
const communityId = randomUUID()
const postId = randomUUID()
const removedPostId = randomUUID()
const communityName = `ideas_${suffix}`
const previousCommunity = process.env.SPROUTBIZ_IDEA_COMMUNITY

beforeAll(async () => {
  process.env.SPROUTBIZ_IDEA_COMMUNITY = communityName
  await db
    .insertInto("user")
    .values({
      id: userId,
      username: `idea-reconcile-${suffix}`,
      email: `idea-reconcile-${suffix}@example.invalid`,
    })
    .execute()
  await db
    .insertInto("community")
    .values({
      id: communityId,
      name: communityName,
      displayName: "Idea reconciliation",
      description: "A disposable idea reconciliation community.",
      visibility: "public",
      createdByUserId: userId,
    })
    .execute()
  await db
    .insertInto("post")
    .values([
      {
        id: postId,
        authorUserId: userId,
        communityId,
        type: "text",
        title: "A durable idea",
        slug: "a-durable-idea",
      },
      {
        id: removedPostId,
        authorUserId: userId,
        communityId,
        type: "text",
        title: "A removed idea",
        slug: "a-removed-idea",
        removedAt: new Date(),
      },
    ])
    .execute()
})

afterAll(async () => {
  if (previousCommunity === undefined) delete process.env.SPROUTBIZ_IDEA_COMMUNITY
  else process.env.SPROUTBIZ_IDEA_COMMUNITY = previousCommunity
  await db.deleteFrom("contributionSubmission").where("userId", "=", userId).execute()
  await db.deleteFrom("post").where("authorUserId", "=", userId).execute()
  await db.deleteFrom("community").where("id", "=", communityId).execute()
  await db.deleteFrom("user").where("id", "=", userId).execute()
  await db.destroy()
})

describe("idea post reconciliation", () => {
  it("creates and Slack-notifies exactly one submission for each live idea post", async () => {
    await reconcileIdeaPosts()
    await reconcileIdeaPosts()

    const submissions = await db
      .selectFrom("contributionSubmission")
      .select(["postId", "status", "slackNotifiedAt"])
      .where("userId", "=", userId)
      .execute()
    expect(submissions).toHaveLength(1)
    expect(submissions[0]).toMatchObject({ postId, status: "pending" })
    expect(submissions[0]?.slackNotifiedAt).toBeInstanceOf(Date)
    expect(postSlack).toHaveBeenCalledTimes(1)
  })
})
