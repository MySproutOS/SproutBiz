import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  // One row per user rather than a step table: onboarding is a short fixed ladder and each
  // step has a natural completion timestamp, so this stays cheap to read on every page load.
  await db.schema
    .createTable("user_onboarding")
    .addColumn("user_id", "uuid", (col) =>
      col.primaryKey().references("user.id").onDelete("cascade"),
    )
    .addColumn("current_step", "text", (col) => col.notNull().defaultTo(sql`'token'`))
    .addColumn("agent_token_id", "uuid", (col) =>
      col.references("agent_token.id").onDelete("set null"),
    )
    .addColumn("browser_agent", "text")
    .addColumn("verification_nonce", "text")
    .addColumn("verification_started_at", "timestamptz")
    .addColumn("browser_verified_at", "timestamptz")
    .addColumn("browser_user_agent", "text")
    .addColumn("goal", "text")
    .addColumn("goal_set_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "user_onboarding_step_check",
      sql`current_step IN ('token','install','verify','kickoff','goal','done')`,
    )
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("user_onboarding").ifExists().execute()
}
