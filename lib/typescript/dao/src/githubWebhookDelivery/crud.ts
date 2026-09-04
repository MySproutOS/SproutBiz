import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely } from "kysely"
import { sql } from "kysely"

export function crudGithubWebhookDelivery(db: Kysely<DB>) {
  async function receive(data: Insertable<DB["githubWebhookDelivery"]>): Promise<boolean> {
    const row = await db
      .insertInto("githubWebhookDelivery")
      .values(data)
      .onConflict((oc) => oc.column("deliveryId").doNothing())
      .returning("deliveryId")
      .executeTakeFirst()
    return row !== undefined
  }

  async function claim(
    deliveryId: string,
    staleBefore = new Date(Date.now() - 5 * 60 * 1000),
  ): Promise<boolean> {
    const row = await db
      .updateTable("githubWebhookDelivery")
      .set({
        status: "processing",
        attemptCount: sql`attempt_count + 1`,
        lastAttemptAt: new Date(),
        lastError: null,
      })
      .where("deliveryId", "=", deliveryId)
      .where((eb) =>
        eb.or([
          eb("status", "in", ["received", "failed"]),
          eb.and([
            eb("status", "=", "processing"),
            eb.or([eb("lastAttemptAt", "is", null), eb("lastAttemptAt", "<", staleBefore)]),
          ]),
        ]),
      )
      .returning("deliveryId")
      .executeTakeFirst()
    return row !== undefined
  }

  async function complete(deliveryId: string, status: "processed" | "ignored"): Promise<void> {
    await db
      .updateTable("githubWebhookDelivery")
      .set({ status, processedAt: new Date(), lastError: null })
      .where("deliveryId", "=", deliveryId)
      .execute()
  }

  async function fail(deliveryId: string, error: string): Promise<void> {
    await db
      .updateTable("githubWebhookDelivery")
      .set({ status: "failed", lastError: error.slice(0, 4000) })
      .where("deliveryId", "=", deliveryId)
      .execute()
  }

  return { receive, claim, complete, fail }
}
