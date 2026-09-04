import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchBusinessRepository(db: Kysely<DB>) {
  async function get(id: string): Promise<Selectable<DB["businessRepository"]> | undefined> {
    return await db
      .selectFrom("businessRepository")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()
  }

  async function getByGithubId(
    githubRepositoryId: string,
  ): Promise<Selectable<DB["businessRepository"]> | undefined> {
    return await db
      .selectFrom("businessRepository")
      .selectAll()
      .where("githubRepositoryId", "=", githubRepositoryId)
      .executeTakeFirst()
  }

  async function listActive(): Promise<Selectable<DB["businessRepository"]>[]> {
    return await db
      .selectFrom("businessRepository")
      .selectAll()
      .where("active", "=", true)
      .orderBy("createdAt", "asc")
      .execute()
  }

  async function listForBusiness(
    businessId: string,
  ): Promise<Selectable<DB["businessRepository"]>[]> {
    return await db
      .selectFrom("businessRepository")
      .selectAll()
      .where("businessId", "=", businessId)
      .orderBy("createdAt", "asc")
      .execute()
  }

  return { get, getByGithubId, listActive, listForBusiness }
}
