import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("business_provisioning")
    .addColumn("sproutos_custom_domain_id", "text")
    .addColumn("custom_domain", "text")
    .addColumn("custom_domain_status", "text")
    .addColumn("deployment_requested_at", "timestamptz")
    .addColumn("deployment_attempt_count", "integer", (col) => col.notNull().defaultTo(0))
    .execute()

  // A forum idea is one reviewable unit. Retries may return the existing submission, but they
  // must never create two businesses or two ten-credit awards for the same post.
  await sql`
    CREATE UNIQUE INDEX contribution_submission_idea_post_key
    ON contribution_submission (post_id)
    WHERE type = 'idea'
  `.execute(db)
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS contribution_submission_idea_post_key`.execute(db)
  await db.schema
    .alterTable("business_provisioning")
    .dropColumn("deployment_attempt_count")
    .dropColumn("deployment_requested_at")
    .dropColumn("custom_domain_status")
    .dropColumn("custom_domain")
    .dropColumn("sproutos_custom_domain_id")
    .execute()
}
