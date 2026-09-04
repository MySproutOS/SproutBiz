import { randomUUID } from "node:crypto"
import { db } from "@template-nextjs/db"
import { afterAll, describe, expect, it } from "vitest"
import { crudGithubWebhookDelivery } from "./crud"
import { fetchGithubWebhookDelivery } from "./fetch"

const prefix = `recovery-${randomUUID()}`
const receivedId = `${prefix}-received`
const activeId = `${prefix}-active`
const staleId = `${prefix}-stale`

afterAll(async () => {
  await db.deleteFrom("githubWebhookDelivery").where("deliveryId", "like", `${prefix}%`).execute()
  await db.destroy()
})

describe("GitHub webhook delivery recovery", () => {
  it("reclaims only deliveries whose processing lease is stale", async () => {
    await db
      .insertInto("githubWebhookDelivery")
      .values([
        {
          deliveryId: receivedId,
          eventName: "pull_request",
          payload: { action: "closed" },
          status: "received",
        },
        {
          deliveryId: activeId,
          eventName: "pull_request",
          payload: { action: "closed" },
          status: "processing",
          lastAttemptAt: new Date(),
        },
        {
          deliveryId: staleId,
          eventName: "pull_request",
          payload: { action: "closed" },
          status: "processing",
          lastAttemptAt: new Date(Date.now() - 10 * 60 * 1000),
        },
      ])
      .execute()

    const retryable = await fetchGithubWebhookDelivery(db).listRetryable(
      new Date(Date.now() - 5 * 60 * 1000),
    )
    const ids = retryable.map((row) => row.deliveryId)
    expect(ids).toContain(receivedId)
    expect(ids).toContain(staleId)
    expect(ids).not.toContain(activeId)

    expect(await crudGithubWebhookDelivery(db).claim(activeId)).toBe(false)
    expect(await crudGithubWebhookDelivery(db).claim(staleId)).toBe(true)
  })
})
