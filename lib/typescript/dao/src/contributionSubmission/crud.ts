import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudContributionSubmission(db: Kysely<DB>) {
  async function create(
    data: PartialBy<Insertable<DB["contributionSubmission"]>, "id">,
  ): Promise<Selectable<DB["contributionSubmission"]>> {
    return await db
      .insertInto("contributionSubmission")
      .values({ id: v7(), ...data })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function reject(
    id: string,
    reviewerUserId: string,
    reason: string,
  ): Promise<Selectable<DB["contributionSubmission"]> | undefined> {
    return await db
      .updateTable("contributionSubmission")
      .set({
        status: "rejected",
        reviewedByUserId: reviewerUserId,
        reviewedAt: new Date(),
        reviewReason: reason,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .where("status", "=", "pending")
      .returningAll()
      .executeTakeFirst()
  }

  async function createIdeaForPost(input: {
    userId: string
    postId: string
    evidence: Insertable<DB["contributionSubmission"]>["evidence"]
  }): Promise<{ row: Selectable<DB["contributionSubmission"]>; created: boolean }> {
    const row = await db
      .insertInto("contributionSubmission")
      .values({
        id: v7(),
        userId: input.userId,
        type: "idea",
        businessId: null,
        postId: input.postId,
        codeContributionPrId: null,
        evidence: input.evidence,
      })
      .onConflict((oc) => oc.column("postId").where("type", "=", "idea").doNothing())
      .returningAll()
      .executeTakeFirst()
    if (row) return { row, created: true }
    return {
      row: await db
        .selectFrom("contributionSubmission")
        .selectAll()
        .where("postId", "=", input.postId)
        .where("type", "=", "idea")
        .executeTakeFirstOrThrow(),
      created: false,
    }
  }

  async function createValidation(input: {
    userId: string
    businessId: string
    feedbackSubmissionId: string
    evidence: Insertable<DB["contributionSubmission"]>["evidence"]
  }): Promise<{ row: Selectable<DB["contributionSubmission"]>; created: boolean }> {
    const row = await db
      .insertInto("contributionSubmission")
      .values({
        id: v7(),
        userId: input.userId,
        type: "validation",
        businessId: input.businessId,
        postId: null,
        codeContributionPrId: null,
        feedbackSubmissionId: input.feedbackSubmissionId,
        evidence: input.evidence,
      })
      .onConflict((oc) =>
        oc.columns(["userId", "feedbackSubmissionId"]).where("type", "=", "validation").doNothing(),
      )
      .returningAll()
      .executeTakeFirst()
    if (row) return { row, created: true }
    return {
      row: await db
        .selectFrom("contributionSubmission")
        .selectAll()
        .where("userId", "=", input.userId)
        .where("feedbackSubmissionId", "=", input.feedbackSubmissionId)
        .where("type", "=", "validation")
        .executeTakeFirstOrThrow(),
      created: false,
    }
  }

  async function markSlackNotified(id: string): Promise<void> {
    await db
      .updateTable("contributionSubmission")
      .set({ slackNotifiedAt: new Date(), updatedAt: new Date() })
      .where("id", "=", id)
      .execute()
  }

  return { create, createIdeaForPost, createValidation, markSlackNotified, reject }
}
