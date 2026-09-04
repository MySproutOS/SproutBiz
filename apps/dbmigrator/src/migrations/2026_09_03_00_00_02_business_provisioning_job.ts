import type { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("business_provisioning").addColumn("sproutos_job_id", "text").execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("business_provisioning").dropColumn("sproutos_job_id").execute()
}
