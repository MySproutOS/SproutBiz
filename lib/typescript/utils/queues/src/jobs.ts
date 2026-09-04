import type { JobsOptions, Queue } from "bullmq"
import { fastQueue, mediumQueue, slowQueue } from "./queues"

// Maps each job name to its payload shape. New jobs are added here and wired into the
// worker switch in apps/bullground. `rising-recompute` is the seed job; M3 fills it in.
export interface JobPayloadMap {
  "rising-recompute": Record<string, never>
  "media-cleanup": { postId: string }
  "scheduled-post-publish": { scheduledPostId: string }
  "recurring-post-scheduler": Record<string, never>
  "draft-expiry": Record<string, never>
  "es-sync-post": { postId: string }
  "es-sync-comment": { commentId: string }
  "es-sync-community": { communityId: string }
  "es-sync-user": { userId: string }
  "es-backfill": Record<string, never>
  "link-preview-fetch": { postId: string; linkUrl: string }
  "revenue-aggregate-daily": Record<string, never>
  "marketing-reminder": Record<string, never>
  "github.process_webhook": { deliveryId: string }
  "github.sync_business_prs": { businessRepositoryId?: string }
  "github.sync_pull_request": { businessRepositoryId: string; pullRequestNumber: number }
  "github.backfill_user_prs": { userId: string }
  "contribution.estimate_code_month": {
    userId: string
    businessId: string
    periodStart: string
  }
  "contribution.close_code_month": { periodStart?: string }
  "business.provision_accepted_idea": { provisioningId: string }
  "business.poll_provisioning": { provisioningId: string; pollAttempt: number }
  "durable-job-reconcile": Record<string, never>
  "idea-post-reconcile": Record<string, never>
}

export type JobName = keyof JobPayloadMap

const jobQueues: { [K in JobName]: Queue } = {
  "rising-recompute": mediumQueue,
  "media-cleanup": slowQueue,
  "scheduled-post-publish": mediumQueue,
  "recurring-post-scheduler": mediumQueue,
  "draft-expiry": slowQueue,
  "es-sync-post": fastQueue,
  "es-sync-comment": fastQueue,
  "es-sync-community": fastQueue,
  "es-sync-user": fastQueue,
  "es-backfill": slowQueue,
  "link-preview-fetch": slowQueue,
  "revenue-aggregate-daily": slowQueue,
  "marketing-reminder": slowQueue,
  "github.process_webhook": fastQueue,
  "github.sync_business_prs": slowQueue,
  "github.sync_pull_request": mediumQueue,
  "github.backfill_user_prs": slowQueue,
  "contribution.estimate_code_month": mediumQueue,
  "contribution.close_code_month": slowQueue,
  "business.provision_accepted_idea": slowQueue,
  "business.poll_provisioning": slowQueue,
  "durable-job-reconcile": slowQueue,
  "idea-post-reconcile": slowQueue,
}

export async function enqueue<K extends JobName>(
  name: K,
  payload: JobPayloadMap[K],
  opts?: JobsOptions,
): Promise<void> {
  await jobQueues[name].add(name, payload, opts)
}

export async function enqueueRisingRecompute(): Promise<void> {
  await enqueue(
    "rising-recompute",
    {},
    { jobId: "rising-recompute", removeOnComplete: true, removeOnFail: 100 },
  )
}

const MEDIA_CLEANUP_DELAY_MS = 30 * 60 * 1000

export function mediaCleanupJobId(postId: string): string {
  return `media-cleanup__${postId}`
}

export async function enqueueMediaCleanup(postId: string): Promise<void> {
  await enqueue(
    "media-cleanup",
    { postId },
    {
      jobId: mediaCleanupJobId(postId),
      delay: MEDIA_CLEANUP_DELAY_MS,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

export async function promoteMediaCleanup(postId: string): Promise<boolean> {
  const job = await slowQueue.getJob(mediaCleanupJobId(postId))
  if (!job) return false
  try {
    await job.promote()
    return true
  } catch {
    return false
  }
}

export function scheduledPostJobId(scheduledPostId: string): string {
  return `scheduled-post__${scheduledPostId}`
}

export async function enqueueScheduledPostPublish(
  scheduledPostId: string,
  delayMs: number,
  jobId: string,
): Promise<void> {
  await enqueue(
    "scheduled-post-publish",
    { scheduledPostId },
    {
      jobId,
      delay: Math.max(0, delayMs),
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

export async function removeScheduledPostJob(jobId: string): Promise<boolean> {
  try {
    await mediumQueue.remove(jobId)
    return true
  } catch {
    return false
  }
}

async function enqueueEsSync<K extends JobName>(
  name: K,
  payload: JobPayloadMap[K],
  entityId: string,
): Promise<void> {
  await enqueue(name, payload, {
    jobId: `${name}__${entityId}`,
    removeOnComplete: true,
    removeOnFail: 100,
  })
}

export async function enqueueEsSyncPost(postId: string): Promise<void> {
  await enqueueEsSync("es-sync-post", { postId }, postId)
}

export async function enqueueEsSyncComment(commentId: string): Promise<void> {
  await enqueueEsSync("es-sync-comment", { commentId }, commentId)
}

export async function enqueueEsSyncCommunity(communityId: string): Promise<void> {
  await enqueueEsSync("es-sync-community", { communityId }, communityId)
}

export async function enqueueEsSyncUser(userId: string): Promise<void> {
  await enqueueEsSync("es-sync-user", { userId }, userId)
}

export async function enqueueEsBackfill(): Promise<void> {
  await enqueue(
    "es-backfill",
    {},
    { jobId: "es-backfill", removeOnComplete: true, removeOnFail: 100 },
  )
}

export function linkPreviewFetchJobId(postId: string): string {
  return `link-preview-fetch__${postId}`
}

export async function enqueueLinkPreviewFetch(postId: string, linkUrl: string): Promise<void> {
  await enqueue(
    "link-preview-fetch",
    { postId, linkUrl },
    {
      jobId: linkPreviewFetchJobId(postId),
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

export async function enqueueGithubWebhook(deliveryId: string): Promise<void> {
  await enqueue(
    "github.process_webhook",
    { deliveryId },
    {
      jobId: `github-webhook__${deliveryId}`,
      attempts: 8,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: true,
      // Delivery state is retained in Postgres; retaining a failed queue job with the same ID
      // would prevent the durable reconciler from scheduling it after the failure is repaired.
      removeOnFail: true,
    },
  )
}

export async function enqueueGithubPullRequestSync(
  businessRepositoryId: string,
  pullRequestNumber: number,
): Promise<void> {
  await enqueue(
    "github.sync_pull_request",
    { businessRepositoryId, pullRequestNumber },
    {
      jobId: `github-pr__${businessRepositoryId}__${pullRequestNumber}`,
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

export async function enqueueGithubUserBackfill(userId: string): Promise<void> {
  await enqueue(
    "github.backfill_user_prs",
    { userId },
    { jobId: `github-user-backfill__${userId}`, removeOnComplete: true, removeOnFail: 100 },
  )
}

export async function enqueueCodeMonthEstimate(
  userId: string,
  businessId: string,
  periodStart: string,
): Promise<void> {
  await enqueue(
    "contribution.estimate_code_month",
    { userId, businessId, periodStart },
    {
      jobId: `code-month-estimate__${userId}__${businessId}__${periodStart}`,
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

export async function enqueueBusinessProvisioning(provisioningId: string): Promise<void> {
  await enqueue(
    "business.provision_accepted_idea",
    { provisioningId },
    {
      jobId: `business-provisioning__${provisioningId}`,
      attempts: 8,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: true,
      // The database row is the durable source of truth. A retained terminal BullMQ job with
      // this deterministic ID would prevent the reconciler from re-enqueuing interrupted work.
      removeOnFail: true,
    },
  )
}

export async function enqueueBusinessProvisioningPoll(
  provisioningId: string,
  pollAttempt: number,
): Promise<void> {
  await enqueue(
    "business.poll_provisioning",
    { provisioningId, pollAttempt },
    {
      jobId: `business-provisioning-poll__${provisioningId}__${pollAttempt}`,
      // Repository builds are fast, but managed-domain certificates are deliberately async.
      // Four hours of 30-second polls covers ordinary issuance without holding a worker open.
      delay: 30_000,
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  )
}

const RISING_RECOMPUTE_INTERVAL_MS = 90 * 1000
const RECURRING_POST_SCHEDULER_INTERVAL_MS = 15 * 60 * 1000
const DRAFT_EXPIRY_INTERVAL_MS = 24 * 60 * 60 * 1000
// Often enough that the public figures are never far behind, cheap enough to ignore: the
// job is two grouped SUMs over indexed columns.
const REVENUE_AGGREGATE_INTERVAL_MS = 10 * 60 * 1000
// Hourly is the right granularity for a reminder a human acts on: it bounds how late a
// "views are due now" ping can be to an hour, without filling the channel.
const MARKETING_REMINDER_INTERVAL_MS = 60 * 60 * 1000
const GITHUB_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1000
const CODE_MONTH_CLOSE_INTERVAL_MS = 24 * 60 * 60 * 1000
const DURABLE_JOB_RECONCILE_INTERVAL_MS = 60 * 1000
const IDEA_POST_RECONCILE_INTERVAL_MS = 60 * 1000

// Registers all recurring schedulers. Idempotent — `upsertJobScheduler` reconciles the
// schedule on every boot, so calling this on every worker start is safe.
export async function registerRepeatables(): Promise<void> {
  await mediumQueue.upsertJobScheduler(
    "rising-recompute",
    { every: RISING_RECOMPUTE_INTERVAL_MS },
    { name: "rising-recompute", data: {} },
  )
  await mediumQueue.upsertJobScheduler(
    "recurring-post-scheduler",
    { every: RECURRING_POST_SCHEDULER_INTERVAL_MS },
    { name: "recurring-post-scheduler", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "draft-expiry",
    { every: DRAFT_EXPIRY_INTERVAL_MS },
    { name: "draft-expiry", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "revenue-aggregate-daily",
    { every: REVENUE_AGGREGATE_INTERVAL_MS },
    { name: "revenue-aggregate-daily", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "marketing-reminder",
    { every: MARKETING_REMINDER_INTERVAL_MS },
    { name: "marketing-reminder", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "github.sync_business_prs",
    { every: GITHUB_RECONCILIATION_INTERVAL_MS },
    { name: "github.sync_business_prs", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "contribution.close_code_month",
    { every: CODE_MONTH_CLOSE_INTERVAL_MS },
    { name: "contribution.close_code_month", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "durable-job-reconcile",
    { every: DURABLE_JOB_RECONCILE_INTERVAL_MS },
    { name: "durable-job-reconcile", data: {} },
  )
  await slowQueue.upsertJobScheduler(
    "idea-post-reconcile",
    { every: IDEA_POST_RECONCILE_INTERVAL_MS },
    { name: "idea-post-reconcile", data: {} },
  )
}
