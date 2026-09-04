import { db } from "@template-nextjs/db"
import { v7 } from "uuid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { crudContributionSubmission } from "../contributionSubmission/crud"
import { crudContributionAward } from "./crud"
import { fetchContributionAward } from "./fetch"

const suffix = v7().slice(0, 8)
const contributorId = v7()
const reviewerId = v7()
let submissionId: string
let businessId: string

beforeAll(async () => {
  await db
    .insertInto("user")
    .values([
      {
        id: contributorId,
        username: `contributor-${suffix}`,
        email: `contributor-${suffix}@example.invalid`,
      },
      {
        id: reviewerId,
        username: `reviewer-${suffix}`,
        email: `reviewer-${suffix}@example.invalid`,
        isAdmin: true,
      },
    ])
    .execute()
  submissionId = (
    await crudContributionSubmission(db).create({
      userId: contributorId,
      type: "idea",
      businessId: null,
      postId: null,
      codeContributionPrId: null,
      evidence: { source: "integration-test" },
    })
  ).id
})

afterAll(async () => {
  if (businessId) {
    const business = await db
      .selectFrom("business")
      .select("communityId")
      .where("id", "=", businessId)
      .executeTakeFirst()
    await db.deleteFrom("contributionAward").where("businessId", "=", businessId).execute()
    await db.deleteFrom("contributionSubmission").where("id", "=", submissionId).execute()
    await db.deleteFrom("business").where("id", "=", businessId).execute()
    if (business?.communityId) {
      await db.deleteFrom("community").where("id", "=", business.communityId).execute()
    }
  }
  await db.deleteFrom("user").where("id", "in", [contributorId, reviewerId]).execute()
  await db.destroy()
})

describe("idea contribution acceptance", () => {
  it("atomically creates one business, community, provisioning record, and ten-credit award", async () => {
    const input = {
      submissionId,
      reviewerUserId: reviewerId,
      businessName: "Contribution Test",
      businessSlug: `contribution-${suffix}`,
      communityName: `contrib_${suffix}`,
      repositoryName: `contribution-${suffix}`,
      tagline: "A test business",
      description: "Used to prove atomic acceptance.",
      platform: "web" as const,
    }
    const first = await crudContributionAward(db).acceptIdea(input)
    businessId = first.business.id
    const retry = await crudContributionAward(db).acceptIdea(input)

    expect(retry.business.id).toBe(first.business.id)
    expect(retry.award.id).toBe(first.award.id)
    expect(retry.provisioning.id).toBe(first.provisioning.id)
    expect(first.award.points).toBe(10)

    const counts = await Promise.all([
      db
        .selectFrom("business")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("id", "=", businessId)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("businessProvisioning")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("businessId", "=", businessId)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("contributionAward")
        .select((eb) => eb.fn.countAll<number>().as("count"))
        .where("sourceSubmissionId", "=", submissionId)
        .executeTakeFirstOrThrow(),
    ])
    expect(counts.map(({ count }) => String(count))).toEqual(["1", "1", "1"])

    const summary = await fetchContributionAward(db).summarizeForUser(contributorId)
    expect(summary.total).toBe(10)
    expect(summary.byBusiness).toEqual([
      { businessId, businessName: "Contribution Test", points: 10 },
    ])
  })
})
