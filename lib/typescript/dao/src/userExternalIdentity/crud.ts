import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudUserExternalIdentity(db: Kysely<DB>) {
  async function upsertForUser(
    data: PartialBy<Insertable<DB["userExternalIdentity"]>, "id">,
  ): Promise<Selectable<DB["userExternalIdentity"]>> {
    return await db
      .insertInto("userExternalIdentity")
      .values({ id: v7(), ...data })
      .onConflict((oc) =>
        oc.columns(["userId", "provider"]).doUpdateSet({
          providerSubject: (eb) => eb.ref("excluded.providerSubject"),
          handle: (eb) => eb.ref("excluded.handle"),
          verifiedAt: (eb) => eb.ref("excluded.verifiedAt"),
          lastSyncedAt: (eb) => eb.ref("excluded.lastSyncedAt"),
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function deleteForUser(userId: string, provider: string): Promise<boolean> {
    const result = await db
      .deleteFrom("userExternalIdentity")
      .where("userId", "=", userId)
      .where("provider", "=", provider)
      .executeTakeFirst()
    return (result.numDeletedRows ?? 0n) > 0n
  }

  return { upsertForUser, deleteForUser }
}
