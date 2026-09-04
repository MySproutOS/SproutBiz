import { randomUUID } from "node:crypto"
import { db } from "@template-nextjs/db"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  enqueueEstimate: vi.fn<
    (userId: string, businessId: string, periodStart: string) => Promise<void>
  >(() => Promise.resolve()),
  enqueuePullRequest: vi.fn<
    (businessRepositoryId: string, pullRequestNumber: number) => Promise<void>
  >(() => Promise.resolve()),
  githubRequest:
    vi.fn<(installationId: string, path: string, init?: RequestInit) => Promise<unknown>>(),
}))

vi.mock("@utils/queues", () => ({
  enqueueCodeMonthEstimate: mocks.enqueueEstimate,
  enqueueGithubPullRequestSync: mocks.enqueuePullRequest,
}))

vi.mock("../utils/githubApp", () => {
  class GithubApiError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  }
  return { GithubApiError, githubAppRequest: mocks.githubRequest }
})

import {
  processCodeMonthClose,
  processCodeMonthEstimate,
  processGithubBusinessSync,
} from "./githubContributions"

const suffix = randomUUID().slice(0, 8)
const userId = randomUUID()
const businessId = randomUUID()
const businessRepositoryId = randomUUID()

beforeAll(async () => {
  await db
    .insertInto("user")
    .values({
      id: userId,
      username: `code-${suffix}`,
      email: `code-${suffix}@example.invalid`,
    })
    .execute()
  await db
    .insertInto("userExternalIdentity")
    .values({
      id: randomUUID(),
      userId,
      provider: "github",
      providerSubject: "424242",
      handle: `coder-${suffix}`,
      verifiedAt: new Date("2026-08-01T00:00:00.000Z"),
      lastSyncedAt: new Date("2026-08-01T00:00:00.000Z"),
    })
    .execute()
  await db
    .insertInto("business")
    .values({
      id: businessId,
      ownerUserId: userId,
      name: `Code business ${suffix}`,
      slug: `code-${suffix}`,
      contributionsStartedAt: new Date("2026-08-01T00:00:00.000Z"),
    })
    .execute()
  await db
    .insertInto("businessRepository")
    .values({
      id: businessRepositoryId,
      businessId,
      githubRepositoryId: "808080",
      githubInstallationId: "12345",
      ownerLogin: "SproutOS-Agents",
      name: `code-${suffix}`,
      defaultBranch: "main",
    })
    .execute()
})

beforeEach(() => {
  mocks.enqueueEstimate.mockClear()
  mocks.enqueuePullRequest.mockClear()
  mocks.githubRequest.mockReset()
})

afterAll(async () => {
  await db.deleteFrom("business").where("id", "=", businessId).execute()
  await db.deleteFrom("user").where("id", "=", userId).execute()
  await db.destroy()
})

describe("GitHub contribution reconciliation", () => {
  it("maps a numeric GitHub identity and submits the combined month for human review", async () => {
    const pullRequest = {
      id: 919191,
      number: 17,
      html_url: `https://github.com/SproutOS-Agents/code-${suffix}/pull/17`,
      title: "Fix a valuable production bug",
      body: "Includes a regression test.",
      state: "closed",
      merged_at: "2026-09-02T12:00:00.000Z",
      additions: 300,
      deletions: 120,
      changed_files: 8,
      commits: 3,
      user: { id: 424242, login: `coder-${suffix}` },
      labels: [{ name: "bug" }],
      head: { sha: "abc123" },
    }
    mocks.githubRequest.mockImplementation((_installationId, path) => {
      if (path.includes("/pulls?state=all")) return Promise.resolve([pullRequest])
      if (path.endsWith("/pulls/17")) return Promise.resolve(pullRequest)
      if (path.endsWith("/pulls/17/reviews")) {
        return Promise.resolve([{ id: 1, state: "APPROVED", user: { id: 7, login: "reviewer" } }])
      }
      if (path.endsWith("/commits/abc123/check-runs?per_page=100")) {
        return Promise.resolve({
          check_runs: [{ id: 2, name: "CI", status: "completed", conclusion: "success" }],
        })
      }
      return Promise.reject(new Error(`Unexpected GitHub request: ${path}`))
    })

    await processGithubBusinessSync({ businessRepositoryId })

    const stored = await db
      .selectFrom("codeContributionPr")
      .selectAll()
      .where("businessRepositoryId", "=", businessRepositoryId)
      .executeTakeFirstOrThrow()
    expect(stored.authorProviderSubject).toBe("424242")
    expect(stored.eligible).toBe(true)
    expect(stored.exclusionReason).toBeNull()
    expect(mocks.enqueueEstimate).toHaveBeenCalledWith(userId, businessId, "2026-09-01")

    await processCodeMonthEstimate({ userId, businessId, periodStart: "2026-09-01" })
    const collecting = await db
      .selectFrom("contributionCodeMonth")
      .selectAll()
      .where("userId", "=", userId)
      .where("businessId", "=", businessId)
      .executeTakeFirstOrThrow()
    expect(collecting.mergedPrCount).toBe(1)
    expect(collecting.additions).toBe(300)
    expect(collecting.deletions).toBe(120)
    expect(collecting.proposedPoints).toBe(5)
    expect(collecting.status).toBe("collecting")

    await processCodeMonthClose({ periodStart: "2026-09-01" })
    const pending = await db
      .selectFrom("contributionCodeMonth")
      .select(["status", "finalizedAt"])
      .where("id", "=", collecting.id)
      .executeTakeFirstOrThrow()
    expect(pending.status).toBe("pending_review")
    expect(pending.finalizedAt).toBeNull()
  })
})
