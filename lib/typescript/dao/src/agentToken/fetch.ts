import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchAgentToken(db: Kysely<DB>) {
  async function getOne<T extends (keyof DB["agentToken"])[]>(
    id: string,
    fields: T,
  ): Promise<Pick<Selectable<DB["agentToken"]>, T[number]> | undefined> {
    return await db.selectFrom("agentToken").select(fields).where("id", "=", id).executeTakeFirst()
  }

  async function listByUserId<T extends (keyof DB["agentToken"])[]>(
    userId: string,
    fields: T,
  ): Promise<Pick<Selectable<DB["agentToken"]>, T[number]>[]> {
    return await db
      .selectFrom("agentToken")
      .select(fields)
      .where("userId", "=", userId)
      .orderBy("createdAt", "desc")
      .execute()
  }

  return { getOne, listByUserId }
}
