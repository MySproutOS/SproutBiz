import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable, Updateable } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudMarketingVideo(db: Kysely<DB>) {
  async function create(
    data: PartialBy<Insertable<DB["marketingVideo"]>, "id">,
  ): Promise<Selectable<DB["marketingVideo"]>> {
    return await db
      .insertInto("marketingVideo")
      .values({ id: v7(), ...data })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function update(
    id: string,
    data: Updateable<DB["marketingVideo"]>,
  ): Promise<Selectable<DB["marketingVideo"]> | undefined> {
    return await db
      .updateTable("marketingVideo")
      .set(data)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirst()
  }

  /**
   * Marks a reminder as delivered, but only if it has not been already.
   *
   * The guard is in the WHERE clause rather than in the caller because the hourly sweep and
   * a retry of the same job can overlap; whoever loses updates zero rows and stays quiet.
   */
  async function markReminderSent(
    id: string,
    column: "reminderDayBeforeSentAt" | "reminderDueSentAt",
  ): Promise<boolean> {
    const result = await db
      .updateTable("marketingVideo")
      .set({ [column]: new Date() })
      .where("id", "=", id)
      .where(column, "is", null)
      .executeTakeFirst()
    return (result.numUpdatedRows ?? 0n) > 0n
  }

  async function deleteOwn(id: string, submitterUserId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("marketingVideo")
      .where("id", "=", id)
      .where("submitterUserId", "=", submitterUserId)
      // Once a video has been reviewed it is part of the record, including a rejection.
      .where("status", "=", "pending")
      .executeTakeFirst()
    return (result.numDeletedRows ?? 0n) > 0n
  }

  return { create, update, markReminderSent, deleteOwn }
}
