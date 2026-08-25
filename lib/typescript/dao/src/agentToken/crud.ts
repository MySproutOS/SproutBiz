import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudAgentToken(db: Kysely<DB>) {
  async function create(
    data: PartialBy<Insertable<DB["agentToken"]>, "id">,
  ): Promise<Selectable<DB["agentToken"]>> {
    return await db
      .insertInto("agentToken")
      .values({ id: v7(), ...data })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  /** Revoking is a soft delete: the row stays so the token cannot be re-minted with the same
   *  hash, and so a user can still see that the token existed. */
  async function revoke(id: string, userId: string): Promise<boolean> {
    const result = await db
      .updateTable("agentToken")
      .set({ revokedAt: new Date() })
      .where("id", "=", id)
      .where("userId", "=", userId)
      .where("revokedAt", "is", null)
      .executeTakeFirst()
    return (result.numUpdatedRows ?? 0n) > 0n
  }

  async function touchLastUsed(id: string, at: Date): Promise<void> {
    await db.updateTable("agentToken").set({ lastUsedAt: at }).where("id", "=", id).execute()
  }

  return { create, revoke, touchLastUsed }
}
