import type { DB, Json } from "@template-nextjs/db"
import type { Kysely, NotNull, Selectable } from "kysely"

export type PendingFeedbackSubmission = {
  id: string
  businessId: string
  userId: string
  evidence: Json
  createdAt: Date
  businessName: string
  businessSlug: string
  submittedBy: string
}

export function fetchContributionSubmission(db: Kysely<DB>) {
  async function get(id: string): Promise<Selectable<DB["contributionSubmission"]> | undefined> {
    return await db
      .selectFrom("contributionSubmission")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()
  }

  async function listForUser(
    userId: string,
    limit = 100,
  ): Promise<Selectable<DB["contributionSubmission"]>[]> {
    return await db
      .selectFrom("contributionSubmission")
      .selectAll()
      .where("userId", "=", userId)
      .orderBy("createdAt", "desc")
      .limit(limit)
      .execute()
  }

  async function getIdeaForPost(
    postId: string,
  ): Promise<Selectable<DB["contributionSubmission"]> | undefined> {
    return await db
      .selectFrom("contributionSubmission")
      .selectAll()
      .where("type", "=", "idea")
      .where("postId", "=", postId)
      .executeTakeFirst()
  }

  async function listForReview(
    type?: string,
    limit = 100,
  ): Promise<Selectable<DB["contributionSubmission"]>[]> {
    let query = db.selectFrom("contributionSubmission").selectAll().where("status", "=", "pending")
    if (type !== undefined) query = query.where("type", "=", type)
    return await query.orderBy("createdAt", "asc").limit(limit).execute()
  }

  async function listPendingFeedback(limit = 100): Promise<PendingFeedbackSubmission[]> {
    return await db
      .selectFrom("contributionSubmission")
      .innerJoin("business", "business.id", "contributionSubmission.businessId")
      .innerJoin("user", "user.id", "contributionSubmission.userId")
      .select([
        "contributionSubmission.id",
        "contributionSubmission.businessId",
        "contributionSubmission.userId",
        "contributionSubmission.evidence",
        "contributionSubmission.createdAt",
        "business.name as businessName",
        "business.slug as businessSlug",
        "user.username as submittedBy",
      ])
      .where("contributionSubmission.type", "=", "feedback")
      .where("contributionSubmission.status", "=", "pending")
      .where("contributionSubmission.businessId", "is not", null)
      .orderBy("contributionSubmission.createdAt", "asc")
      .limit(limit)
      .$narrowType<{ businessId: NotNull }>()
      .execute()
  }

  return { get, getIdeaForPost, listForUser, listForReview, listPendingFeedback }
}
