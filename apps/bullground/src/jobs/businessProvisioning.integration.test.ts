import { db } from "@template-nextjs/db"
import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  enqueuePoll: vi.fn<(provisioningId: string, pollAttempt: number) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  githubRequest:
    vi.fn<(installationId: string, path: string, init?: RequestInit) => Promise<unknown>>(),
  postSlack: vi.fn<(message: string, channel?: string) => Promise<boolean>>(() =>
    Promise.resolve(true),
  ),
}))

vi.mock("@utils/queues", () => ({
  enqueueBusinessProvisioningPoll: mocks.enqueuePoll,
}))

vi.mock("@utils/slack", () => ({
  mentionOwner: () => "",
  postSlack: mocks.postSlack,
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

import { GithubApiError } from "../utils/githubApp"
import {
  processBusinessProvisioning,
  processBusinessProvisioningPoll,
} from "./businessProvisioning"

const suffix = randomUUID().slice(0, 8)
const userId = randomUUID()
const businessId = randomUUID()
const provisioningId = randomUUID()
const repositoryName = `worker-${suffix}`
const originalFetch = globalThis.fetch
const savedEnvironment = new Map<string, string | undefined>()
const environment = {
  GITHUB_APP_INSTALLATION_ID: "12345",
  NEXT_PUBLIC_STRIPE_PUBLIC_KEY: "pk_test_public",
  SLACK_OPS_CHANNEL: "ops-test",
  SPROUTBIZ_API_URL: "https://sproutos.biz/api/v1",
  SPROUTBIZ_BUSINESS_DOMAIN_SUFFIX: "sproutos.biz",
  SPROUTOS_API_URL: "https://api.sproutos.invalid",
  SPROUTOS_ORG_SLUG: "sproutbiz-test",
  SPROUTOS_REGION: "us-east-1",
  SPROUTOS_SERVICE_TOKEN: "test-service-token",
  STRIPE_SECRET_KEY: "sk_test_secret",
}

beforeAll(async () => {
  for (const [key, value] of Object.entries(environment)) {
    savedEnvironment.set(key, process.env[key])
    process.env[key] = value
  }
  await db
    .insertInto("user")
    .values({
      id: userId,
      username: `worker-${suffix}`,
      email: `worker-${suffix}@example.invalid`,
    })
    .execute()
  await db
    .insertInto("business")
    .values({
      id: businessId,
      ownerUserId: userId,
      name: `Worker business ${suffix}`,
      slug: `worker-${suffix}`,
      description: "Provisioning integration test",
    })
    .execute()
  await db
    .insertInto("businessProvisioning")
    .values({ id: provisioningId, businessId, repositoryName })
    .execute()
})

beforeEach(() => {
  mocks.events.length = 0
  mocks.enqueuePoll.mockClear()
  mocks.githubRequest.mockReset()
  mocks.postSlack.mockClear()
})

afterAll(async () => {
  globalThis.fetch = originalFetch
  await db.deleteFrom("business").where("id", "=", businessId).execute()
  await db.deleteFrom("user").where("id", "=", userId).execute()
  await db.destroy()
  for (const [key, value] of savedEnvironment) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("accepted idea business provisioning", () => {
  it("creates the template repository, configures SproutOS, deploys, and claims its domain", async () => {
    let repositoryLookups = 0
    mocks.githubRequest.mockImplementation(
      (_installationId: string, path: string, init?: RequestInit) => {
        mocks.events.push(`github:${init?.method ?? "GET"}:${path}`)
        if (path === `/repos/SproutOS-Agents/${repositoryName}`) {
          repositoryLookups += 1
          return Promise.reject(new GithubApiError(404, "not found"))
        }
        if (path === "/repos/MySproutOS/sproutbiz-business-template/generate") {
          return Promise.resolve({
            id: 987654,
            name: repositoryName,
            default_branch: "main",
            html_url: `https://github.com/SproutOS-Agents/${repositoryName}`,
            owner: { login: "SproutOS-Agents" },
          })
        }
        if (path.endsWith("/actions/workflows/deploy-sproutos.yml/dispatches")) {
          return Promise.resolve(undefined)
        }
        return Promise.reject(new Error(`Unexpected GitHub request: ${path}`))
      },
    )

    let projectReads = 0
    let projectCreateBody: { source: { githubRepoId: string }; idempotencyKey: string } | undefined
    globalThis.fetch = vi.fn<typeof fetch>((input, init) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url)
      const method = init?.method ?? "GET"
      mocks.events.push(`sproutos:${method}:${url.pathname}`)
      if (method === "POST" && url.pathname === "/v1/orgs/sproutbiz-test/projects") {
        if (typeof init?.body !== "string") throw new TypeError("Expected a JSON request body")
        projectCreateBody = JSON.parse(init.body) as {
          source: { githubRepoId: string }
          idempotencyKey: string
        }
        return Promise.resolve(
          Response.json({
            project: { id: "project-1", primaryUrl: null, url: null },
            job: { id: "job-1", state: "queued" },
          }),
        )
      }
      if (method === "PUT" && url.pathname === "/v1/orgs/sproutbiz-test/projects/project-1/env") {
        return Promise.resolve(Response.json({ ok: true }))
      }
      if (method === "GET" && url.pathname.endsWith("/jobs/job-1")) {
        return Promise.resolve(
          Response.json({ id: "job-1", state: "succeeded", errorMessage: null }),
        )
      }
      if (method === "GET" && url.pathname === "/v1/orgs/sproutbiz-test/projects/project-1") {
        projectReads += 1
        return Promise.resolve(
          Response.json({
            id: "project-1",
            liveDeploymentId: projectReads === 1 ? null : "deployment-1",
          }),
        )
      }
      if (method === "GET" && url.pathname.endsWith("/projects/project-1/domains")) {
        return Promise.resolve(Response.json({ data: [] }))
      }
      if (method === "POST" && url.pathname.endsWith("/projects/project-1/domains")) {
        return Promise.resolve(
          Response.json(
            {
              id: "domain-1",
              hostname: `worker-${suffix}.sproutos.biz`,
              domainKind: "managed",
              status: "active",
            },
            { status: 201 },
          ),
        )
      }
      return Promise.resolve(
        new Response(`Unexpected SproutOS request: ${method} ${url.pathname}`, {
          status: 500,
        }),
      )
    })

    await processBusinessProvisioning({ provisioningId })
    expect(repositoryLookups).toBe(2)
    expect(projectCreateBody?.source.githubRepoId).toBe("987654")
    expect(projectCreateBody?.idempotencyKey).toBe(`sproutbiz:${businessId}`)
    expect(mocks.enqueuePoll).toHaveBeenLastCalledWith(provisioningId, 1)

    const envWrites = mocks.events.filter((event) => event.endsWith("/projects/project-1/env"))
    expect(envWrites).toHaveLength(4)

    await processBusinessProvisioningPoll({ provisioningId, pollAttempt: 1 })
    expect(mocks.githubRequest).toHaveBeenCalledWith(
      "12345",
      `/repos/SproutOS-Agents/${repositoryName}/actions/workflows/deploy-sproutos.yml/dispatches`,
      { method: "POST", body: JSON.stringify({ ref: "main" }) },
    )

    await processBusinessProvisioningPoll({ provisioningId, pollAttempt: 2 })
    const completed = await db
      .selectFrom("businessProvisioning")
      .selectAll()
      .where("id", "=", provisioningId)
      .executeTakeFirstOrThrow()
    expect(completed.status).toBe("deployed")
    expect(completed.githubRepositoryId).toBe("987654")
    expect(completed.sproutosProjectId).toBe("project-1")
    expect(completed.customDomain).toBe(`worker-${suffix}.sproutos.biz`)
    expect(completed.deploymentUrl).toBe(`https://worker-${suffix}.sproutos.biz`)
    expect(mocks.postSlack).toHaveBeenCalledOnce()
  })
})
