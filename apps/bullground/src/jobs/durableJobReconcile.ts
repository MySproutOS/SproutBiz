import { fetchBusinessProvisioning, fetchGithubWebhookDelivery } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { enqueueBusinessProvisioning, enqueueGithubWebhook } from "@utils/queues"

/**
 * Reconciles database-backed work with BullMQ. The database transaction is authoritative for
 * accepted ideas and webhook receipt; queue insertion deliberately happens after that transaction,
 * so an unavailable Valkey must be repairable without a human clicking the action again.
 */
export async function reconcileDurableJobs(): Promise<void> {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000)
  const [provisioning, webhooks] = await Promise.all([
    fetchBusinessProvisioning(db).listRecoverable(staleBefore),
    fetchGithubWebhookDelivery(db).listRetryable(staleBefore),
  ])

  for (const row of provisioning) await enqueueBusinessProvisioning(row.id)
  for (const delivery of webhooks) await enqueueGithubWebhook(delivery.deliveryId)
}
