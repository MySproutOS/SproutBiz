import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudCodeContributionPr(db: Kysely<DB>) {
  async function upsert(
    data: PartialBy<Insertable<DB["codeContributionPr"]>, "id">,
  ): Promise<Selectable<DB["codeContributionPr"]>> {
    // node-postgres serializes a top-level JavaScript array as a PostgreSQL array literal. These
    // columns are jsonb, so send JSON text explicitly; PostgreSQL then stores and returns actual
    // JSON arrays rather than rejecting values such as `{bug}` as invalid JSON.
    const values = {
      id: v7(),
      ...data,
      ...(data.labels === undefined ? {} : { labels: JSON.stringify(data.labels) }),
      ...(data.reviews === undefined ? {} : { reviews: JSON.stringify(data.reviews) }),
      ...(data.checks === undefined ? {} : { checks: JSON.stringify(data.checks) }),
    }
    return await db
      .insertInto("codeContributionPr")
      .values(values)
      .onConflict((oc) =>
        oc.column("githubPullRequestId").doUpdateSet({
          businessRepositoryId: (eb) => eb.ref("excluded.businessRepositoryId"),
          number: (eb) => eb.ref("excluded.number"),
          authorProviderSubject: (eb) => eb.ref("excluded.authorProviderSubject"),
          authorHandle: (eb) => eb.ref("excluded.authorHandle"),
          url: (eb) => eb.ref("excluded.url"),
          title: (eb) => eb.ref("excluded.title"),
          body: (eb) => eb.ref("excluded.body"),
          state: (eb) => eb.ref("excluded.state"),
          mergedAt: (eb) => eb.ref("excluded.mergedAt"),
          additions: (eb) => eb.ref("excluded.additions"),
          deletions: (eb) => eb.ref("excluded.deletions"),
          changedFiles: (eb) => eb.ref("excluded.changedFiles"),
          commitCount: (eb) => eb.ref("excluded.commitCount"),
          labels: (eb) => eb.ref("excluded.labels"),
          reviews: (eb) => eb.ref("excluded.reviews"),
          checks: (eb) => eb.ref("excluded.checks"),
          eligible: (eb) => eb.ref("excluded.eligible"),
          exclusionReason: (eb) => eb.ref("excluded.exclusionReason"),
          lastSeenAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return { upsert }
}
