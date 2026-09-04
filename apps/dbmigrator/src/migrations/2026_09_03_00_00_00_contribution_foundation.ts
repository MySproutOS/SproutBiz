import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("business")
    .addColumn("contributions_started_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute()

  await db.schema
    .createTable("user_external_identity")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("cascade").notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("provider_subject", "text", (col) => col.notNull())
    .addColumn("handle", "text", (col) => col.notNull())
    .addColumn("verified_at", "timestamptz", (col) => col.notNull())
    .addColumn("last_synced_at", "timestamptz", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("user_external_identity_provider_check", sql`provider IN ('github')`)
    .addUniqueConstraint("user_external_identity_provider_subject_key", [
      "provider",
      "provider_subject",
    ])
    .addUniqueConstraint("user_external_identity_user_provider_key", ["user_id", "provider"])
    .execute()

  await db.schema
    .createIndex("user_external_identity_handle_idx")
    .on("user_external_identity")
    .columns(["provider", "handle"])
    .execute()

  await db.schema
    .createTable("business_repository")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("github_repository_id", "text", (col) => col.notNull().unique())
    .addColumn("github_installation_id", "text")
    .addColumn("owner_login", "text", (col) => col.notNull())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("default_branch", "text", (col) => col.notNull().defaultTo(sql`'main'`))
    .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("last_reconciled_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await sql`
    CREATE UNIQUE INDEX business_repository_full_name_lower_key
    ON business_repository (lower(owner_login), lower(name))
  `.execute(db)
  await db.schema
    .createIndex("business_repository_business_idx")
    .on("business_repository")
    .columns(["business_id", "active"])
    .execute()

  await db.schema
    .createTable("github_webhook_delivery")
    .addColumn("delivery_id", "text", (col) => col.primaryKey())
    .addColumn("event_name", "text", (col) => col.notNull())
    .addColumn("action", "text")
    .addColumn("github_repository_id", "text")
    .addColumn("payload", "jsonb", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'received'`))
    .addColumn("attempt_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("last_error", "text")
    .addColumn("received_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("processed_at", "timestamptz")
    .addCheckConstraint(
      "github_webhook_delivery_status_check",
      sql`status IN ('received','processing','processed','failed','ignored')`,
    )
    .execute()

  await db.schema
    .createIndex("github_webhook_delivery_status_idx")
    .on("github_webhook_delivery")
    .columns(["status", "received_at"])
    .execute()

  await db.schema
    .createTable("code_contribution_pr")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_repository_id", "uuid", (col) =>
      col.references("business_repository.id").onDelete("cascade").notNull(),
    )
    .addColumn("github_pull_request_id", "text", (col) => col.notNull().unique())
    .addColumn("number", "integer", (col) => col.notNull())
    .addColumn("author_provider_subject", "text", (col) => col.notNull())
    .addColumn("author_handle", "text", (col) => col.notNull())
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text")
    .addColumn("state", "text", (col) => col.notNull())
    .addColumn("merged_at", "timestamptz")
    .addColumn("additions", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("deletions", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("changed_files", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("commit_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("labels", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("reviews", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("checks", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("eligible", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("exclusion_reason", "text")
    .addColumn("first_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("last_seen_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "code_contribution_pr_state_check",
      sql`state IN ('open','closed','merged')`,
    )
    .addUniqueConstraint("code_contribution_pr_repository_number_key", [
      "business_repository_id",
      "number",
    ])
    .execute()

  await db.schema
    .createIndex("code_contribution_pr_author_month_idx")
    .on("code_contribution_pr")
    .columns(["author_provider_subject", "merged_at"])
    .execute()

  await db.schema
    .createTable("contribution_submission")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("cascade").notNull())
    .addColumn("business_id", "uuid", (col) => col.references("business.id").onDelete("set null"))
    .addColumn("post_id", "uuid", (col) => col.references("post.id").onDelete("set null"))
    .addColumn("code_contribution_pr_id", "uuid", (col) =>
      col.references("code_contribution_pr.id").onDelete("set null"),
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("evidence", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'pending'`))
    .addColumn("reviewed_by_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("review_reason", "text")
    .addColumn("slack_notified_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "contribution_submission_type_check",
      sql`type IN ('idea','code','feedback','validation')`,
    )
    .addCheckConstraint(
      "contribution_submission_status_check",
      sql`status IN ('pending','accepted','rejected')`,
    )
    .execute()

  await sql`
    CREATE UNIQUE INDEX contribution_submission_code_pr_key
    ON contribution_submission (code_contribution_pr_id)
    WHERE code_contribution_pr_id IS NOT NULL
  `.execute(db)
  await db.schema
    .createIndex("contribution_submission_review_idx")
    .on("contribution_submission")
    .columns(["status", "type", "created_at"])
    .execute()
  await db.schema
    .createIndex("contribution_submission_user_idx")
    .on("contribution_submission")
    .columns(["user_id", "created_at desc"])
    .execute()

  await db.schema
    .createTable("contribution_code_month")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("cascade").notNull())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("period_start", "date", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'collecting'`))
    .addColumn("merged_pr_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("additions", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("deletions", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("changed_files", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("proposed_points", "smallint")
    .addColumn("proposed_reason", "text")
    .addColumn("evidence", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("finalized_by_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("finalized_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "contribution_code_month_status_check",
      sql`status IN ('collecting','pending_review','finalized','rejected')`,
    )
    .addCheckConstraint(
      "contribution_code_month_points_check",
      sql`proposed_points IS NULL OR proposed_points BETWEEN 1 AND 10`,
    )
    .addCheckConstraint(
      "contribution_code_month_period_check",
      sql`extract(day FROM period_start) = 1`,
    )
    .addUniqueConstraint("contribution_code_month_user_business_period_key", [
      "user_id",
      "business_id",
      "period_start",
    ])
    .execute()

  await db.schema
    .createIndex("contribution_code_month_review_idx")
    .on("contribution_code_month")
    .columns(["status", "period_start"])
    .execute()

  await db.schema
    .createTable("contribution_award")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("cascade").notNull())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("points", "smallint", (col) => col.notNull())
    .addColumn("source_submission_id", "uuid", (col) =>
      col.references("contribution_submission.id").onDelete("restrict"),
    )
    .addColumn("source_code_month_id", "uuid", (col) =>
      col.references("contribution_code_month.id").onDelete("restrict"),
    )
    .addColumn("awarded_by_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "contribution_award_type_check",
      sql`type IN ('idea','code','feedback','validation')`,
    )
    .addCheckConstraint("contribution_award_points_check", sql`points BETWEEN 1 AND 10`)
    .execute()

  await sql`
    CREATE UNIQUE INDEX contribution_award_submission_key
    ON contribution_award (source_submission_id)
    WHERE source_submission_id IS NOT NULL
  `.execute(db)
  await sql`
    CREATE UNIQUE INDEX contribution_award_code_month_key
    ON contribution_award (source_code_month_id)
    WHERE source_code_month_id IS NOT NULL
  `.execute(db)
  await db.schema
    .createIndex("contribution_award_user_idx")
    .on("contribution_award")
    .columns(["user_id", "created_at desc"])
    .execute()
  await db.schema
    .createIndex("contribution_award_business_idx")
    .on("contribution_award")
    .columns(["business_id", "created_at desc"])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("contribution_award").ifExists().execute()
  await db.schema.dropTable("contribution_code_month").ifExists().execute()
  await db.schema.dropTable("contribution_submission").ifExists().execute()
  await db.schema.dropTable("code_contribution_pr").ifExists().execute()
  await db.schema.dropTable("github_webhook_delivery").ifExists().execute()
  await db.schema.dropTable("business_repository").ifExists().execute()
  await db.schema.dropTable("user_external_identity").ifExists().execute()
  await db.schema.alterTable("business").dropColumn("contributions_started_at").execute()
}
