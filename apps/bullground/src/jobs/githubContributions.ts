import {
  crudBusinessRepository,
  crudCodeContributionPr,
  crudContributionCodeMonth,
  crudGithubWebhookDelivery,
  fetchBusiness,
  fetchBusinessRepository,
  fetchCodeContributionPr,
  fetchContributionCodeMonth,
  fetchGithubWebhookDelivery,
  fetchUserExternalIdentity,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import {
  enqueueCodeMonthEstimate,
  enqueueGithubPullRequestSync,
  type JobPayloadMap,
} from "@utils/queues"
import { GithubApiError, githubAppRequest } from "../utils/githubApp"

type GithubRepository = {
  id: number
  name: string
  default_branch: string
  owner: { login: string }
}

type GithubPullRequest = {
  id: number
  number: number
  html_url: string
  title: string
  body: string | null
  state: "open" | "closed"
  merged_at: string | null
  additions: number
  deletions: number
  changed_files: number
  commits: number
  user: { id: number; login: string } | null
  labels: Array<{ name?: string }>
  head: { sha: string }
}

type GithubReview = { id: number; state: string; user: { id: number; login: string } | null }
type GithubCheckRun = { id: number; name: string; status: string; conclusion: string | null }

function monthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
}

function nextMonth(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 1))
}

function githubFullName(repositoryUrl: string): { owner: string; name: string } | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?\/?$/i.exec(repositoryUrl)
  return match ? { owner: match[1], name: match[2] } : null
}

/** Imports repository mappings for businesses that predate the contribution tables. */
async function discoverBusinessRepositories(): Promise<void> {
  const businesses = await db
    .selectFrom("business")
    .leftJoin("businessRepository", "businessRepository.businessId", "business.id")
    .select(["business.id", "business.repoUrl"])
    .where("business.repoUrl", "is not", null)
    .where("businessRepository.id", "is", null)
    .execute()
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID
  if (!installationId) return

  for (const business of businesses) {
    const fullName = business.repoUrl ? githubFullName(business.repoUrl) : null
    if (!fullName) continue
    try {
      const repository = await githubAppRequest<GithubRepository>(
        installationId,
        `/repos/${encodeURIComponent(fullName.owner)}/${encodeURIComponent(fullName.name)}`,
      )
      await crudBusinessRepository(db).upsert({
        businessId: business.id,
        githubRepositoryId: String(repository.id),
        githubInstallationId: installationId,
        ownerLogin: repository.owner.login,
        name: repository.name,
        defaultBranch: repository.default_branch,
      })
    } catch (error) {
      if (error instanceof GithubApiError && (error.status === 403 || error.status === 404)) {
        console.warn(`[github] cannot import ${fullName.owner}/${fullName.name}: ${error.status}`)
        continue
      }
      throw error
    }
  }
}

async function syncPullRequest(businessRepositoryId: string, number: number): Promise<void> {
  const repository = await fetchBusinessRepository(db).get(businessRepositoryId)
  if (!repository?.active || !repository.githubInstallationId) return
  const root = `/repos/${encodeURIComponent(repository.ownerLogin)}/${encodeURIComponent(repository.name)}`
  const pull = await githubAppRequest<GithubPullRequest>(
    repository.githubInstallationId,
    `${root}/pulls/${number}`,
  )
  if (!pull.user) return
  const [reviews, checkRuns] = await Promise.all([
    githubAppRequest<GithubReview[]>(
      repository.githubInstallationId,
      `${root}/pulls/${number}/reviews`,
    ),
    githubAppRequest<{ check_runs: GithubCheckRun[] }>(
      repository.githubInstallationId,
      `${root}/commits/${pull.head.sha}/check-runs?per_page=100`,
    ),
  ])
  const business = await fetchBusiness(db).getOne(repository.businessId, [
    "id",
    "contributionsStartedAt",
  ])
  if (!business) return
  const subject = String(pull.user.id)
  const identity = await fetchUserExternalIdentity(db).getBySubject("github", subject)
  const mergedAt = pull.merged_at ? new Date(pull.merged_at) : null
  const eligible =
    identity !== undefined && mergedAt !== null && mergedAt >= business.contributionsStartedAt

  await crudCodeContributionPr(db).upsert({
    businessRepositoryId: repository.id,
    githubPullRequestId: String(pull.id),
    number: pull.number,
    authorProviderSubject: subject,
    authorHandle: pull.user.login,
    url: pull.html_url,
    title: pull.title,
    body: pull.body,
    state: pull.merged_at ? "merged" : pull.state,
    mergedAt,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    commitCount: pull.commits,
    labels: pull.labels
      .map((label) => label.name)
      .filter((label): label is string => label !== undefined),
    reviews: reviews.map((review) => ({
      id: review.id,
      state: review.state,
      userId: review.user?.id ?? null,
      login: review.user?.login ?? null,
    })),
    checks: checkRuns.check_runs.map((check) => ({
      id: check.id,
      name: check.name,
      status: check.status,
      conclusion: check.conclusion,
    })),
    eligible,
    exclusionReason: eligible
      ? null
      : mergedAt === null
        ? "not_merged"
        : identity === undefined
          ? "github_identity_not_linked"
          : "before_contribution_program",
  })

  if (eligible && identity && mergedAt) {
    await enqueueCodeMonthEstimate(
      identity.userId,
      repository.businessId,
      monthStart(mergedAt).toISOString().slice(0, 10),
    )
  }
}

export async function processGithubWebhook(
  payload: JobPayloadMap["github.process_webhook"],
): Promise<void> {
  if (!(await crudGithubWebhookDelivery(db).claim(payload.deliveryId))) return
  try {
    const delivery = await fetchGithubWebhookDelivery(db).get(payload.deliveryId)
    if (!delivery || delivery.eventName !== "pull_request") {
      await crudGithubWebhookDelivery(db).complete(payload.deliveryId, "ignored")
      return
    }
    const body = delivery.payload as {
      number?: number
      repository?: { id?: number }
    }
    const repositoryId = body.repository?.id ?? delivery.githubRepositoryId
    if (body.number === undefined || repositoryId === undefined || repositoryId === null) {
      await crudGithubWebhookDelivery(db).complete(payload.deliveryId, "ignored")
      return
    }
    const repository = await fetchBusinessRepository(db).getByGithubId(String(repositoryId))
    if (!repository) {
      await crudGithubWebhookDelivery(db).complete(payload.deliveryId, "ignored")
      return
    }
    await enqueueGithubPullRequestSync(repository.id, body.number)
    await crudGithubWebhookDelivery(db).complete(payload.deliveryId, "processed")
  } catch (error) {
    await crudGithubWebhookDelivery(db).fail(
      payload.deliveryId,
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

export async function processGithubPullRequestSync(
  payload: JobPayloadMap["github.sync_pull_request"],
): Promise<void> {
  await syncPullRequest(payload.businessRepositoryId, payload.pullRequestNumber)
}

export async function processGithubBusinessSync(
  payload: JobPayloadMap["github.sync_business_prs"],
): Promise<void> {
  if (!payload.businessRepositoryId) await discoverBusinessRepositories()
  const repositories = payload.businessRepositoryId
    ? [await fetchBusinessRepository(db).get(payload.businessRepositoryId)].filter(
        (repository) => repository !== undefined,
      )
    : await fetchBusinessRepository(db).listActive()
  for (const repository of repositories) {
    if (!repository.active || !repository.githubInstallationId) continue
    const root = `/repos/${encodeURIComponent(repository.ownerLogin)}/${encodeURIComponent(repository.name)}`
    for (let page = 1; ; page += 1) {
      const pulls = await githubAppRequest<GithubPullRequest[]>(
        repository.githubInstallationId,
        `${root}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${page}`,
      )
      for (const pull of pulls) await syncPullRequest(repository.id, pull.number)
      if (pulls.length < 100) break
    }
    await crudBusinessRepository(db).markReconciled(repository.id)
  }
}

export async function processGithubUserBackfill(
  payload: JobPayloadMap["github.backfill_user_prs"],
): Promise<void> {
  const identity = await fetchUserExternalIdentity(db).getForUser(payload.userId, "github")
  if (!identity) return
  await processGithubBusinessSync({})
}

export async function processCodeMonthEstimate(
  payload: JobPayloadMap["contribution.estimate_code_month"],
): Promise<void> {
  const identity = await fetchUserExternalIdentity(db).getForUser(payload.userId, "github")
  if (!identity) return
  const periodDate = new Date(`${payload.periodStart}T00:00:00.000Z`)
  const periodEnd = nextMonth(periodDate)
  const prs = await fetchCodeContributionPr(db).listMergedForBusinessIdentityMonth(
    payload.businessId,
    identity.providerSubject,
    periodDate,
    periodEnd,
  )
  if (prs.length === 0) return
  const additions = prs.reduce((sum, pr) => sum + pr.additions, 0)
  const deletions = prs.reduce((sum, pr) => sum + pr.deletions, 0)
  const changedFiles = prs.reduce((sum, pr) => sum + pr.changedFiles, 0)
  const changedLines = additions + deletions
  const labels = prs.flatMap((pr) => (Array.isArray(pr.labels) ? pr.labels : [])).map(String)
  const valueLabels = new Set(["bug", "enhancement", "feature", "performance", "security"])
  const valueBonus = labels.some((label) => valueLabels.has(label.toLowerCase())) ? 2 : 0
  const sizeBonus = changedLines >= 1000 ? 3 : changedLines >= 250 ? 2 : changedLines >= 50 ? 1 : 0
  const points = Math.min(10, Math.max(1, Math.min(5, prs.length) + sizeBonus + valueBonus))
  await crudContributionCodeMonth(db).upsertEstimate({
    userId: payload.userId,
    businessId: payload.businessId,
    // PostgreSQL `date` is deliberately timezone-free. Passing a JavaScript Date here makes
    // node-postgres serialize UTC midnight as the previous calendar day in western timezones.
    periodStart: payload.periodStart,
    mergedPrCount: prs.length,
    additions,
    deletions,
    changedFiles,
    proposedPoints: points,
    proposedReason: `${prs.length} merged PR(s), ${changedLines} changed line(s), ${changedFiles} file(s)`,
    evidence: { pullRequestIds: prs.map((pr) => pr.githubPullRequestId) },
  })
}

export async function processCodeMonthClose(
  payload: JobPayloadMap["contribution.close_code_month"],
): Promise<void> {
  const currentMonth = monthStart(new Date())
  const cutoffDate = payload.periodStart
    ? nextMonth(new Date(`${payload.periodStart}T00:00:00.000Z`))
    : currentMonth
  const cutoff = cutoffDate.toISOString().slice(0, 10)
  const months = await fetchContributionCodeMonth(db).listCollectingBefore(cutoff)
  for (const month of months) await crudContributionCodeMonth(db).submitForReview(month.id)
}
