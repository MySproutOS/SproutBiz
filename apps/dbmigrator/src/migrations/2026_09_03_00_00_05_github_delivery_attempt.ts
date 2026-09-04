import type { Kysely } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("github_webhook_delivery")
    .addColumn("last_attempt_at", "timestamptz")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("github_webhook_delivery").dropColumn("last_attempt_at").execute()
}
