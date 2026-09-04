import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchBusinessProvisioning(db: Kysely<DB>) {
  async function get(id: string): Promise<Selectable<DB["businessProvisioning"]> | undefined> {
    return await db
      .selectFrom("businessProvisioning")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst()
  }

  async function getForBusiness(
    businessId: string,
  ): Promise<Selectable<DB["businessProvisioning"]> | undefined> {
    return await db
      .selectFrom("businessProvisioning")
      .selectAll()
      .where("businessId", "=", businessId)
      .executeTakeFirst()
  }

  async function listRecoverable(
    staleBefore: Date,
    limit = 100,
  ): Promise<Selectable<DB["businessProvisioning"]>[]> {
    return await db
      .selectFrom("businessProvisioning")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb("status", "=", "queued"),
          eb.and([eb("status", "=", "running"), eb("updatedAt", "<", staleBefore)]),
        ]),
      )
      .orderBy("createdAt", "asc")
      .limit(limit)
      .execute()
  }

  return { get, getForBusiness, listRecoverable }
}
