import {
  crudBusinessProvisioning,
  crudBusinessRepository,
  fetchBusiness,
  fetchBusinessProvisioning,
  fetchBusinessRepository,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import { enqueueBusinessProvisioningPoll, type JobPayloadMap } from "@utils/queues"
import { mentionOwner, postSlack } from "@utils/slack"
import { GithubApiError, githubAppRequest } from "../utils/githubApp"

type GithubRepository = {
  id: number
  name: string
  default_branch: string
  html_url: string
  owner: { login: string }
}

type SproutOSProjectResponse = {
  project: { id: string; primaryUrl?: string | null; url?: string | null }
  job: { id: string; state: string; errorMessage?: string | null }
}

type SproutOSJobResponse = {
  id: string
  state: string
  errorMessage?: string | null
}

type SproutOSProject = {
  id: string
  liveDeploymentId?: string | null
  primaryUrl?: string | null
  url?: string | null
}

type GithubWorkflowRun = {
  id: number
  status: string
  conclusion: string | null
  created_at: string
  html_url: string
}

type GithubWorkflowRuns = { workflow_runs: GithubWorkflowRun[] }

const DEPLOY_WORKFLOW = "deploy-sproutos.yml"

type SproutOSCustomDomain = {
  id: string
  hostname: string
  domainKind: "ordinary" | "managed"
  status:
    | "pending_dns"
    | "issuing"
    | "propagating"
    | "active"
    | "renewal_warning"
    | "failed"
    | "deleting"
  statusReason?: string | null
  nextRetryAt?: string | null
}

type SproutOSCustomDomainList = { data: SproutOSCustomDomain[] }

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for business provisioning`)
  return value
}

async function existingRepository(
  installationId: string,
  owner: string,
  name: string,
): Promise<GithubRepository | null> {
  try {
    return await githubAppRequest<GithubRepository>(
      installationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`,
    )
  } catch (error) {
    if (error instanceof GithubApiError && error.status === 404) return null
    throw error
  }
}

async function createRepository(input: {
  installationId: string
  templateOwner: string
  templateRepository: string
  repositoryOwner: string
  repositoryName: string
  description: string
}): Promise<GithubRepository> {
  const existing = await existingRepository(
    input.installationId,
    input.repositoryOwner,
    input.repositoryName,
  )
  if (existing) return existing
  try {
    return await githubAppRequest<GithubRepository>(
      input.installationId,
      `/repos/${encodeURIComponent(input.templateOwner)}/${encodeURIComponent(input.templateRepository)}/generate`,
      {
        method: "POST",
        body: JSON.stringify({
          owner: input.repositoryOwner,
          name: input.repositoryName,
          description: input.description,
          include_all_branches: false,
          private: false,
        }),
      },
    )
  } catch (error) {
    // A restarted worker can race the repository's eventual consistency window: the initial GET
    // misses, template generation reports that the name now exists, and a second GET succeeds.
    if (error instanceof GithubApiError && error.status === 422) {
      const raced = await existingRepository(
        input.installationId,
        input.repositoryOwner,
        input.repositoryName,
      )
      if (raced) return raced
    }
    throw error
  }
}

async function sproutosRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers({
    Authorization: `Bearer ${required("SPROUTOS_SERVICE_TOKEN")}`,
    "Content-Type": "application/json",
  })
  new Headers(init.headers).forEach((value, key) => {
    headers.set(key, value)
  })
  const response = await fetch(`${required("SPROUTOS_API_URL").replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
  })
  if (!response.ok) {
    throw new Error(
      `SproutOS ${init.method ?? "GET"} ${path} failed (${response.status}): ${(await response.text()).slice(0, 1000)}`,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

async function setProjectEnvironment(projectId: string, key: string, value: string): Promise<void> {
  const orgSlug = required("SPROUTOS_ORG_SLUG")
  await sproutosRequest(`/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${projectId}/env`, {
    method: "PUT",
    body: JSON.stringify({ key, value, target: "all", isSecret: true }),
  })
}

async function listProjectDomains(projectId: string): Promise<SproutOSCustomDomain[]> {
  const orgSlug = required("SPROUTOS_ORG_SLUG")
  return (
    await sproutosRequest<SproutOSCustomDomainList>(
      `/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${projectId}/domains`,
    )
  ).data
}

async function ensureManagedBusinessDomain(
  projectId: string,
  businessSlug: string,
): Promise<SproutOSCustomDomain> {
  const orgSlug = required("SPROUTOS_ORG_SLUG")
  const suffix = (process.env.SPROUTBIZ_BUSINESS_DOMAIN_SUFFIX ?? "sproutos.biz")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .toLowerCase()
  if (!suffix) throw new Error("SPROUTBIZ_BUSINESS_DOMAIN_SUFFIX must not be empty")
  const hostname = `${businessSlug}.${suffix}`
  let domain = (await listProjectDomains(projectId)).find(
    (candidate) => candidate.hostname === hostname && candidate.status !== "deleting",
  )

  if (!domain) {
    try {
      domain = await sproutosRequest<SproutOSCustomDomain>(
        `/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${projectId}/domains`,
        { method: "POST", body: JSON.stringify({ hostname }) },
      )
    } catch (error) {
      // A retry can arrive after the claim committed but before its response was observed.
      if (!(error instanceof Error) || !error.message.includes("(409)")) throw error
      domain = (await listProjectDomains(projectId)).find(
        (candidate) => candidate.hostname === hostname && candidate.status !== "deleting",
      )
      if (!domain) throw error
    }
  }

  if (domain.domainKind !== "managed") {
    // An ordinary claim needs a per-host ownership TXT record, which defeats the wildcard-backed
    // business namespace. Release an automation-owned mistaken claim so a retry can succeed after
    // the SproutOS administrator activates the managed suffix policy.
    await sproutosRequest(
      `/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${projectId}/domains/${domain.id}`,
      { method: "DELETE" },
    )
    throw new Error(
      `${suffix} is not an active SproutOS managed-domain policy for ${orgSlug}; ordinary claim removed`,
    )
  }
  return domain
}

async function wakeDomain(projectId: string, domainId: string): Promise<SproutOSCustomDomain> {
  const orgSlug = required("SPROUTOS_ORG_SLUG")
  return await sproutosRequest<SproutOSCustomDomain>(
    `/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${projectId}/domains/${domainId}/check`,
    { method: "POST" },
  )
}

async function projectState(projectId: string): Promise<SproutOSProject> {
  const orgSlug = required("SPROUTOS_ORG_SLUG")
  return await sproutosRequest<SproutOSProject>(
    `/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${projectId}`,
  )
}

async function dispatchDeployment(input: {
  installationId: string
  owner: string
  repository: string
  branch: string
}): Promise<void> {
  await githubAppRequest<void>(
    input.installationId,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/actions/workflows/${DEPLOY_WORKFLOW}/dispatches`,
    { method: "POST", body: JSON.stringify({ ref: input.branch }) },
  )
}

async function latestDeploymentRun(input: {
  installationId: string
  owner: string
  repository: string
  branch: string
  requestedAt: Date
}): Promise<GithubWorkflowRun | undefined> {
  const runs = await githubAppRequest<GithubWorkflowRuns>(
    input.installationId,
    `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/actions/workflows/${DEPLOY_WORKFLOW}/runs?branch=${encodeURIComponent(input.branch)}&per_page=20`,
  )
  const lowerBound = input.requestedAt.getTime() - 60_000
  return runs.workflow_runs.find((run) => Date.parse(run.created_at) >= lowerBound)
}

export async function processBusinessProvisioning(
  payload: JobPayloadMap["business.provision_accepted_idea"],
): Promise<void> {
  if (!(await crudBusinessProvisioning(db).claim(payload.provisioningId))) return
  try {
    const provisioning = await fetchBusinessProvisioning(db).get(payload.provisioningId)
    if (!provisioning) return
    const business = await fetchBusiness(db).getOne(provisioning.businessId, [
      "id",
      "name",
      "slug",
      "description",
    ])
    if (!business) throw new Error("Provisioned business no longer exists")
    const installationId =
      provisioning.githubInstallationId ?? required("GITHUB_APP_INSTALLATION_ID")
    let repository = await existingRepository(
      installationId,
      provisioning.repositoryOwner,
      provisioning.repositoryName,
    )
    repository ??= await createRepository({
      installationId,
      templateOwner: provisioning.templateOwner,
      templateRepository: provisioning.templateRepository,
      repositoryOwner: provisioning.repositoryOwner,
      repositoryName: provisioning.repositoryName,
      description: business.description ?? business.name,
    })
    const githubRepositoryId = String(repository.id)
    await crudBusinessProvisioning(db).recordGithub(
      provisioning.id,
      githubRepositoryId,
      installationId,
    )
    await crudBusinessRepository(db).upsert({
      businessId: business.id,
      githubRepositoryId,
      githubInstallationId: installationId,
      ownerLogin: repository.owner.login,
      name: repository.name,
      defaultBranch: repository.default_branch,
    })

    let projectId = provisioning.sproutosProjectId
    let jobId = provisioning.sproutosJobId
    let deploymentUrl = provisioning.deploymentUrl
    if (!projectId || !jobId) {
      const orgSlug = required("SPROUTOS_ORG_SLUG")
      const result = await sproutosRequest<SproutOSProjectResponse>(
        `/v1/orgs/${encodeURIComponent(orgSlug)}/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            name: business.name,
            description: business.description,
            region: required("SPROUTOS_REGION"),
            slug: business.slug,
            kind: "site",
            productionBranch: "main",
            idempotencyKey: `sproutbiz:${business.id}`,
            source: { type: "repository", githubRepoId: githubRepositoryId },
          }),
        },
      )
      projectId = result.project.id
      jobId = result.job.id
      deploymentUrl = result.project.primaryUrl ?? result.project.url ?? null
      await crudBusinessProvisioning(db).recordSproutOS(
        provisioning.id,
        projectId,
        jobId,
        deploymentUrl,
      )
    }
    await Promise.all([
      setProjectEnvironment(projectId, "SPROUTBIZ_API_URL", required("SPROUTBIZ_API_URL")),
      setProjectEnvironment(projectId, "SPROUTBIZ_BUSINESS_ID", business.id),
      setProjectEnvironment(projectId, "STRIPE_SECRET_KEY", required("STRIPE_SECRET_KEY")),
      setProjectEnvironment(
        projectId,
        "NEXT_PUBLIC_STRIPE_PUBLIC_KEY",
        required("NEXT_PUBLIC_STRIPE_PUBLIC_KEY"),
      ),
    ])
    await enqueueBusinessProvisioningPoll(provisioning.id, 1)
  } catch (error) {
    await crudBusinessProvisioning(db).fail(
      payload.provisioningId,
      error instanceof Error ? error.message : String(error),
    )
    throw error
  }
}

export async function processBusinessProvisioningPoll(
  payload: JobPayloadMap["business.poll_provisioning"],
): Promise<void> {
  const provisioning = await fetchBusinessProvisioning(db).get(payload.provisioningId)
  if (!provisioning || provisioning.status !== "running") return
  if (!provisioning.sproutosProjectId || !provisioning.sproutosJobId) {
    throw new Error("Provisioning has no SproutOS project/job to poll")
  }
  try {
    const orgSlug = required("SPROUTOS_ORG_SLUG")
    const job = await sproutosRequest<SproutOSJobResponse>(
      `/v1/orgs/${encodeURIComponent(orgSlug)}/projects/${provisioning.sproutosProjectId}/jobs/${provisioning.sproutosJobId}`,
    )
    if (job.state === "failed" || job.state === "canceled") {
      const message = job.errorMessage ?? `SproutOS provisioning ${job.state}`
      await crudBusinessProvisioning(db).fail(provisioning.id, message)
      return
    }
    if (job.state !== "succeeded") {
      if (payload.pollAttempt >= 480) throw new Error("SproutOS provisioning timed out")
      await crudBusinessProvisioning(db).touch(provisioning.id)
      await enqueueBusinessProvisioningPoll(provisioning.id, payload.pollAttempt + 1)
      return
    }

    const repository = (
      await fetchBusinessRepository(db).listForBusiness(provisioning.businessId)
    )[0]
    if (!repository?.githubInstallationId) {
      throw new Error("Provisioned business has no active GitHub App repository mapping")
    }
    const project = await projectState(provisioning.sproutosProjectId)
    if (!project.liveDeploymentId) {
      const previousRun = provisioning.deploymentRequestedAt
        ? await latestDeploymentRun({
            installationId: repository.githubInstallationId,
            owner: repository.ownerLogin,
            repository: repository.name,
            branch: repository.defaultBranch,
            requestedAt: provisioning.deploymentRequestedAt,
          })
        : undefined
      const failed = previousRun?.status === "completed" && previousRun.conclusion !== "success"
      if (!provisioning.deploymentRequestedAt || failed) {
        if (provisioning.deploymentAttemptCount >= 3) {
          const message = `SproutOS deployment workflow failed three times${previousRun ? `; latest run: ${previousRun.html_url}` : ""}`
          await crudBusinessProvisioning(db).fail(provisioning.id, message)
          return
        }
        await dispatchDeployment({
          installationId: repository.githubInstallationId,
          owner: repository.ownerLogin,
          repository: repository.name,
          branch: repository.defaultBranch,
        })
        await crudBusinessProvisioning(db).recordDeploymentRequest(provisioning.id)
      }
      await crudBusinessProvisioning(db).touch(provisioning.id)
      await enqueueBusinessProvisioningPoll(provisioning.id, payload.pollAttempt + 1)
      return
    }

    const business = await fetchBusiness(db).getOne(provisioning.businessId, ["id", "slug"])
    if (!business) throw new Error("Provisioned business no longer exists")
    let domain = await ensureManagedBusinessDomain(provisioning.sproutosProjectId, business.slug)
    if (domain.status === "failed") {
      domain = await wakeDomain(provisioning.sproutosProjectId, domain.id)
    }
    await crudBusinessProvisioning(db).recordCustomDomain(
      provisioning.id,
      domain.id,
      domain.hostname,
      domain.status,
    )

    if (domain.status === "active" || domain.status === "renewal_warning") {
      const deploymentUrl = `https://${domain.hostname}`
      await crudBusinessProvisioning(db).complete(
        provisioning.id,
        provisioning.sproutosProjectId,
        deploymentUrl,
      )
      await postSlack(
        `${mentionOwner()}${provisioning.repositoryOwner}/${provisioning.repositoryName} is deployed at ${deploymentUrl}. Store publishing remains a human step.`,
        process.env.SLACK_OPS_CHANNEL,
      )
      return
    }
    if (payload.pollAttempt >= 480) {
      throw new Error(
        `SproutOS custom domain ${domain.hostname} timed out in ${domain.status}: ${domain.statusReason ?? "no status reason"}`,
      )
    }
    await enqueueBusinessProvisioningPoll(provisioning.id, payload.pollAttempt + 1)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (payload.pollAttempt >= 480) {
      await crudBusinessProvisioning(db).fail(provisioning.id, message)
      throw error
    }
    await crudBusinessProvisioning(db).recordPollError(provisioning.id, message)
    await enqueueBusinessProvisioningPoll(provisioning.id, payload.pollAttempt + 1)
  }
}
