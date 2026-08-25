import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchUserOnboarding(db: Kysely<DB>) {
  async function getOne(userId: string): Promise<Selectable<DB["userOnboarding"]> | undefined> {
    return await db
      .selectFrom("userOnboarding")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirst()
  }

  return { getOne }
}
