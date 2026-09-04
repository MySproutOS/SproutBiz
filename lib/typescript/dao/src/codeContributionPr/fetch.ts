import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchCodeContributionPr(db: Kysely<DB>) {
  async function getByGithubId(
    githubPullRequestId: string,
  ): Promise<Selectable<DB["codeContributionPr"]> | undefined> {
    return await db
      .selectFrom("codeContributionPr")
      .selectAll()
      .where("githubPullRequestId", "=", githubPullRequestId)
      .executeTakeFirst()
  }

  async function listMergedForIdentityMonth(
    providerSubject: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Selectable<DB["codeContributionPr"]>[]> {
    return await db
      .selectFrom("codeContributionPr")
      .selectAll()
      .where("authorProviderSubject", "=", providerSubject)
      .where("eligible", "=", true)
      .where("mergedAt", ">=", periodStart)
      .where("mergedAt", "<", periodEnd)
      .orderBy("mergedAt", "asc")
      .execute()
  }

  async function listMergedForBusinessIdentityMonth(
    businessId: string,
    providerSubject: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Selectable<DB["codeContributionPr"]>[]> {
    return await db
      .selectFrom("codeContributionPr")
      .innerJoin(
        "businessRepository",
        "businessRepository.id",
        "codeContributionPr.businessRepositoryId",
      )
      .selectAll("codeContributionPr")
      .where("businessRepository.businessId", "=", businessId)
      .where("codeContributionPr.authorProviderSubject", "=", providerSubject)
      .where("codeContributionPr.eligible", "=", true)
      .where("codeContributionPr.mergedAt", ">=", periodStart)
      .where("codeContributionPr.mergedAt", "<", periodEnd)
      .orderBy("codeContributionPr.mergedAt", "asc")
      .execute()
  }

  return { getByGithubId, listMergedForIdentityMonth, listMergedForBusinessIdentityMonth }
}
