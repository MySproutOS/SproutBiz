import type { DB } from "@template-nextjs/db"
import type { Insertable, Kysely, Selectable } from "kysely"
import { sql } from "kysely"
import { v7 } from "uuid"
import type { PartialBy } from "../utils/types"

export function crudBusinessProvisioning(db: Kysely<DB>) {
  async function create(
    data: PartialBy<Insertable<DB["businessProvisioning"]>, "id">,
  ): Promise<Selectable<DB["businessProvisioning"]>> {
    return await db
      .insertInto("businessProvisioning")
      .values({ id: v7(), ...data })
      .returningAll()
      .executeTakeFirstOrThrow()
  }

  async function claim(id: string): Promise<boolean> {
    const row = await db
      .updateTable("businessProvisioning")
      .set({
        status: "running",
        startedAt: new Date(),
        attemptCount: sql`attempt_count + 1`,
        lastError: null,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      // Every external step below is idempotent. Allow BullMQ to resume a row left in `running`
      // when a worker process died after this update but before it could enqueue the poll job.
      .where("status", "in", ["queued", "running", "failed"])
      .returning("id")
      .executeTakeFirst()
    return row !== undefined
  }

  async function recordGithub(
    id: string,
    githubRepositoryId: string,
    githubInstallationId: string,
  ): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({ githubRepositoryId, githubInstallationId, updatedAt: new Date() })
      .where("id", "=", id)
      .execute()
  }

  async function recordSproutOS(
    id: string,
    sproutosProjectId: string,
    sproutosJobId: string,
    deploymentUrl: string | null,
  ): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({ sproutosProjectId, sproutosJobId, deploymentUrl, updatedAt: new Date() })
      .where("id", "=", id)
      .execute()
  }

  async function recordCustomDomain(
    id: string,
    sproutosCustomDomainId: string,
    customDomain: string,
    customDomainStatus: string,
  ): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({
        sproutosCustomDomainId,
        customDomain,
        customDomainStatus,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .execute()
  }

  async function recordDeploymentRequest(id: string): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({
        deploymentRequestedAt: new Date(),
        deploymentAttemptCount: sql`deployment_attempt_count + 1`,
        lastError: null,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .execute()
  }

  async function recordPollError(id: string, error: string): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({ lastError: error.slice(0, 4000), updatedAt: new Date() })
      .where("id", "=", id)
      .where("status", "=", "running")
      .execute()
  }

  async function touch(id: string): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({ updatedAt: new Date() })
      .where("id", "=", id)
      .where("status", "=", "running")
      .execute()
  }

  async function complete(
    id: string,
    sproutosProjectId: string,
    deploymentUrl: string | null,
  ): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({
        status: "deployed",
        sproutosProjectId,
        deploymentUrl,
        customDomainStatus: "active",
        completedAt: new Date(),
        lastError: null,
        updatedAt: new Date(),
      })
      .where("id", "=", id)
      .execute()
  }

  async function fail(id: string, error: string): Promise<void> {
    await db
      .updateTable("businessProvisioning")
      .set({ status: "failed", lastError: error.slice(0, 4000), updatedAt: new Date() })
      .where("id", "=", id)
      .execute()
  }

  return {
    create,
    claim,
    recordGithub,
    recordSproutOS,
    recordDeploymentRequest,
    recordCustomDomain,
    recordPollError,
    touch,
    complete,
    fail,
  }
}
