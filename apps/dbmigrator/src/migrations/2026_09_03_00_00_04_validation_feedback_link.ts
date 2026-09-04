import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("contribution_submission")
    .addColumn("feedback_submission_id", "uuid", (col) =>
      col.references("contribution_submission.id").onDelete("set null"),
    )
    .execute()

  await sql`
    ALTER TABLE contribution_submission
    ADD CONSTRAINT contribution_submission_validation_feedback_check
    CHECK ((type = 'validation') = (feedback_submission_id IS NOT NULL))
  `.execute(db)

  // One person can independently validate a finding once. Other people may submit their own
  // reproductions, which gives the reviewer corroborating evidence rather than duplicate credit.
  await sql`
    CREATE UNIQUE INDEX contribution_submission_validation_user_key
    ON contribution_submission (user_id, feedback_submission_id)
    WHERE type = 'validation'
  `.execute(db)

  await db.schema
    .createIndex("contribution_submission_feedback_idx")
    .on("contribution_submission")
    .column("feedback_submission_id")
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("contribution_submission_feedback_idx").ifExists().execute()
  await sql`DROP INDEX IF EXISTS contribution_submission_validation_user_key`.execute(db)
  await sql`
    ALTER TABLE contribution_submission
    DROP CONSTRAINT IF EXISTS contribution_submission_validation_feedback_check
  `.execute(db)
  await db.schema
    .alterTable("contribution_submission")
    .dropColumn("feedback_submission_id")
    .execute()
}
