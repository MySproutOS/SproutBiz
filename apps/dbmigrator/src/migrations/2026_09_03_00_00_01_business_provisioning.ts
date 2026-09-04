import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("business_provisioning")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull().unique(),
    )
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'queued'`))
    .addColumn("template_owner", "text", (col) => col.notNull().defaultTo(sql`'MySproutOS'`))
    .addColumn("template_repository", "text", (col) =>
      col.notNull().defaultTo(sql`'sproutbiz-business-template'`),
    )
    .addColumn("repository_owner", "text", (col) => col.notNull().defaultTo(sql`'SproutOS-Agents'`))
    .addColumn("repository_name", "text", (col) => col.notNull())
    .addColumn("github_repository_id", "text")
    .addColumn("github_installation_id", "text")
    .addColumn("sproutos_project_id", "text")
    .addColumn("deployment_url", "text")
    .addColumn("attempt_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_error", "text")
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "business_provisioning_status_check",
      sql`status IN ('queued','running','deployed','failed')`,
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX business_provisioning_repository_lower_key
    ON business_provisioning (lower(repository_owner), lower(repository_name))
  `.execute(db)
  await db.schema
    .createIndex("business_provisioning_status_idx")
    .on("business_provisioning")
    .columns(["status", "created_at"])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("business_provisioning").ifExists().execute()
}
