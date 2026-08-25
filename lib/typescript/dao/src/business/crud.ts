import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable, Updateable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudBusiness(db: Kysely<DB>) {
  async function create(
    data: PartialBy<Insertable<DB["business"]>, "id">,
  ): Promise<Selectable<DB["business"]>> {
    return await db
      .insertInto("business")
      .values({ id: v7(), ...data })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function update(
    id: string,
    ownerUserId: string,
    data: Updateable<DB["business"]>,
  ): Promise<Selectable<DB["business"]> | undefined> {
    return await db
      .updateTable("business")
      .set(data)
      .where("id", "=", id)
      .where("ownerUserId", "=", ownerUserId)
      .returningAll()
      .executeTakeFirst()
  }

  async function deleteOwn(id: string, ownerUserId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("business")
      .where("id", "=", id)
      .where("ownerUserId", "=", ownerUserId)
      .executeTakeFirst()
    return (result.numDeletedRows ?? 0n) > 0n
  }

  return { create, update, deleteOwn }
}
