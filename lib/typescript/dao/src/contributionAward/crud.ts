import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"
import { v7 } from "uuid"

export type AcceptIdeaInput = {
  submissionId: string
  reviewerUserId: string
  businessName: string
  businessSlug: string
  communityName: string
  tagline: string | null
  description: string | null
  platform: "web" | "ios" | "android"
  repositoryName: string
}

export type AcceptedIdea = {
  award: Selectable<DB["contributionAward"]>
  business: Selectable<DB["business"]>
  provisioning: Selectable<DB["businessProvisioning"]>
}

function validateSubmissionPoints(type: string, points: number): void {
  if (type === "idea" && points === 10) return
  if (type === "feedback" && points >= 1 && points <= 5) return
  if (type === "validation" && points === 1) return
  throw new Error(`Invalid ${type} contribution point award`)
}

export function crudContributionAward(db: Kysely<DB>) {
  async function acceptIdea(input: AcceptIdeaInput): Promise<AcceptedIdea> {
    return await db.transaction().execute(async (trx) => {
      const submission = await trx
        .selectFrom("contributionSubmission")
        .selectAll()
        .where("id", "=", input.submissionId)
        .forUpdate()
        .executeTakeFirstOrThrow()
      if (submission.type !== "idea") throw new Error("Submission is not an idea")

      const existingAward = await trx
        .selectFrom("contributionAward")
        .selectAll()
        .where("sourceSubmissionId", "=", input.submissionId)
        .executeTakeFirst()
      if (existingAward && submission.businessId) {
        const [business, provisioning] = await Promise.all([
          trx
            .selectFrom("business")
            .selectAll()
            .where("id", "=", submission.businessId)
            .executeTakeFirstOrThrow(),
          trx
            .selectFrom("businessProvisioning")
            .selectAll()
            .where("businessId", "=", submission.businessId)
            .executeTakeFirstOrThrow(),
        ])
        return { award: existingAward, business, provisioning }
      }
      if (submission.status !== "pending") throw new Error("Contribution is no longer pending")

      const communityId = v7()
      const businessId = v7()
      const provisioningId = v7()
      await trx
        .insertInto("community")
        .values({
          id: communityId,
          name: input.communityName,
          displayName: input.businessName,
          description: input.description ?? `Contributions to ${input.businessName}`,
          visibility: "public",
          createdByUserId: input.reviewerUserId,
          memberCount: 1,
        })
        .execute()
      await trx
        .insertInto("communityMember")
        .values({ id: v7(), communityId, userId: input.reviewerUserId })
        .execute()
      await trx
        .insertInto("communityModerator")
        .values({
          id: v7(),
          communityId,
          userId: input.reviewerUserId,
          position: 0,
          permEverything: true,
        })
        .execute()

      const business = await trx
        .insertInto("business")
        .values({
          id: businessId,
          ownerUserId: input.reviewerUserId,
          communityId,
          name: input.businessName,
          slug: input.businessSlug,
          tagline: input.tagline,
          description: input.description,
          repoUrl: `https://github.com/SproutOS-Agents/${input.repositoryName}`,
          platform: input.platform,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      const provisioning = await trx
        .insertInto("businessProvisioning")
        .values({ id: provisioningId, businessId, repositoryName: input.repositoryName })
        .returningAll()
        .executeTakeFirstOrThrow()
      await trx
        .updateTable("contributionSubmission")
        .set({
          businessId,
          status: "accepted",
          reviewedByUserId: input.reviewerUserId,
          reviewedAt: new Date(),
          reviewReason: "Accepted as a SproutBiz business",
          updatedAt: new Date(),
        })
        .where("id", "=", input.submissionId)
        .execute()
      const award = await trx
        .insertInto("contributionAward")
        .values({
          id: v7(),
          userId: submission.userId,
          businessId,
          type: "idea",
          points: 10,
          sourceSubmissionId: submission.id,
          sourceCodeMonthId: null,
          awardedByUserId: input.reviewerUserId,
          reason: "Idea accepted as a SproutBiz business",
        })
        .returningAll()
        .executeTakeFirstOrThrow()
      return { award, business, provisioning }
    })
  }

  async function acceptSubmission(
    submissionId: string,
    reviewerUserId: string,
    points: number,
    reason: string,
  ): Promise<Selectable<DB["contributionAward"]>> {
    return await db.transaction().execute(async (trx) => {
      const submission = await trx
        .selectFrom("contributionSubmission")
        .selectAll()
        .where("id", "=", submissionId)
        .forUpdate()
        .executeTakeFirstOrThrow()

      const existing = await trx
        .selectFrom("contributionAward")
        .selectAll()
        .where("sourceSubmissionId", "=", submissionId)
        .executeTakeFirst()
      if (existing !== undefined) return existing
      if (submission.status !== "pending") throw new Error("Contribution is no longer pending")
      if (submission.businessId === null) throw new Error("Contribution has no business")
      validateSubmissionPoints(submission.type, points)

      await trx
        .updateTable("contributionSubmission")
        .set({
          status: "accepted",
          reviewedByUserId: reviewerUserId,
          reviewedAt: new Date(),
          reviewReason: reason,
          updatedAt: new Date(),
        })
        .where("id", "=", submissionId)
        .execute()

      return await trx
        .insertInto("contributionAward")
        .values({
          id: v7(),
          userId: submission.userId,
          businessId: submission.businessId,
          type: submission.type,
          points,
          sourceSubmissionId: submission.id,
          sourceCodeMonthId: null,
          awardedByUserId: reviewerUserId,
          reason,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    })
  }

  async function finalizeCodeMonth(
    codeMonthId: string,
    reviewerUserId: string,
    points: number,
    reason: string,
  ): Promise<Selectable<DB["contributionAward"]>> {
    if (points < 1 || points > 10) throw new Error("Code contribution points must be 1 to 10")
    return await db.transaction().execute(async (trx) => {
      const month = await trx
        .selectFrom("contributionCodeMonth")
        .selectAll()
        .where("id", "=", codeMonthId)
        .forUpdate()
        .executeTakeFirstOrThrow()

      const existing = await trx
        .selectFrom("contributionAward")
        .selectAll()
        .where("sourceCodeMonthId", "=", codeMonthId)
        .executeTakeFirst()
      if (existing !== undefined) return existing
      if (month.status !== "pending_review") throw new Error("Code month is not pending review")

      await trx
        .updateTable("contributionCodeMonth")
        .set({
          status: "finalized",
          proposedPoints: points,
          proposedReason: reason,
          finalizedByUserId: reviewerUserId,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where("id", "=", codeMonthId)
        .execute()

      return await trx
        .insertInto("contributionAward")
        .values({
          id: v7(),
          userId: month.userId,
          businessId: month.businessId,
          type: "code",
          points,
          sourceSubmissionId: null,
          sourceCodeMonthId: month.id,
          awardedByUserId: reviewerUserId,
          reason,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    })
  }

  return { acceptIdea, acceptSubmission, finalizeCodeMonth }
}
