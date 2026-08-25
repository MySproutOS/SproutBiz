import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable, Updateable } from "kysely"

export function crudUserOnboarding(db: Kysely<DB>) {
  /**
   * Returns the user's onboarding row, creating it on first read.
   *
   * `onConflict().doNothing()` then select, rather than insert-or-select, because an agent
   * and its operator can hit this concurrently and a plain insert would race.
   */
  async function getOrCreate(userId: string): Promise<Selectable<DB["userOnboarding"]>> {
    await db
      .insertInto("userOnboarding")
      .values({ userId })
      .onConflict((oc) => oc.column("userId").doNothing())
      .execute()

    return await db
      .selectFrom("userOnboarding")
      .selectAll()
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow()
  }

  async function update(
    userId: string,
    data: Updateable<DB["userOnboarding"]>,
  ): Promise<Selectable<DB["userOnboarding"]>> {
    return await db
      .updateTable("userOnboarding")
      .set({ ...data, updatedAt: new Date() })
      .where("userId", "=", userId)
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  return { getOrCreate, update }
}
