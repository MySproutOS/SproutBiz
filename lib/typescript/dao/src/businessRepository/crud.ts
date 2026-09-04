import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudBusinessRepository(db: Kysely<DB>) {
  async function upsert(
    data: PartialBy<Insertable<DB["businessRepository"]>, "id">,
  ): Promise<Selectable<DB["businessRepository"]>> {
    return await db
      .insertInto("businessRepository")
      .values({ id: v7(), ...data })
      .onConflict((oc) =>
        oc.column("githubRepositoryId").doUpdateSet({
          businessId: (eb) => eb.ref("excluded.businessId"),
          githubInstallationId: (eb) => eb.ref("excluded.githubInstallationId"),
          ownerLogin: (eb) => eb.ref("excluded.ownerLogin"),
          name: (eb) => eb.ref("excluded.name"),
          defaultBranch: (eb) => eb.ref("excluded.defaultBranch"),
          active: (eb) => eb.ref("excluded.active"),
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function markReconciled(id: string): Promise<void> {
    await db
      .updateTable("businessRepository")
      .set({ lastReconciledAt: new Date(), updatedAt: new Date() })
      .where("id", "=", id)
      .execute()
  }

  return { upsert, markReconciled }
}
