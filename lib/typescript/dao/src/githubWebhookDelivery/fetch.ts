import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

export function fetchGithubWebhookDelivery(db: Kysely<DB>) {
  async function get(
    deliveryId: string,
  ): Promise<Selectable<DB["githubWebhookDelivery"]> | undefined> {
    return await db
      .selectFrom("githubWebhookDelivery")
      .selectAll()
      .where("deliveryId", "=", deliveryId)
      .executeTakeFirst()
  }

  async function listRetryable(
    staleBefore: Date,
    limit = 100,
  ): Promise<Selectable<DB["githubWebhookDelivery"]>[]> {
    return await db
      .selectFrom("githubWebhookDelivery")
      .selectAll()
      .where((eb) =>
        eb.or([
          eb("status", "in", ["received", "failed"]),
          eb.and([
            eb("status", "=", "processing"),
            eb.or([eb("lastAttemptAt", "is", null), eb("lastAttemptAt", "<", staleBefore)]),
          ]),
        ]),
      )
      .orderBy("receivedAt", "asc")
      .limit(limit)
      .execute()
  }

  return { get, listRetryable }
}
