import { type Kysely, sql } from "kysely"

/**
 * The Earn Money creator program.
 *
 * Anyone can post a short-form advert for one of our businesses. Each business sets aside a
 * share of its profit each month, and that pool is split between the videos in proportion to
 * their weighted views over the first 30 days of the video's life.
 *
 * The shape here follows the same reasoning as business_revenue: money lives in bigint cents,
 * no payment credential is ever stored (only Stripe's account id), and the constraints that
 * protect the money -- one video paid once, one payout row per video per pool -- are in the
 * database rather than only in a handler.
 */

/** Andrew's production user row. Promoted here so /admin exists without a manual UPDATE. */
const ANDREW_USER_ID = "01a0572f-7aa9-7688-b047-b3ba4d164c4a"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("marketing_video")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("submitter_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("platform", "text", (col) => col.notNull())
    .addColumn("external_video_id", "text", (col) => col.notNull())
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'pending'`))
    .addColumn("rejection_reason", "text")
    // Confirmed by a human at approval rather than trusted from the submitter: whether the
    // advert actually showcases the product is a judgement call, and so is its length.
    .addColumn("duration_seconds", "integer")
    // When the video was created. The 30-day window runs from here, not from submission,
    // so a creator cannot restart their own clock by resubmitting.
    .addColumn("posted_at", "timestamptz")
    .addColumn("measure_at", "timestamptz")
    .addColumn("view_count", "bigint")
    .addColumn("view_count_recorded_at", "timestamptz")
    .addColumn("weighted_views", "bigint")
    .addColumn("reviewed_by_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("set null"),
    )
    .addColumn("reviewed_at", "timestamptz")
    // Written once a reminder has actually reached Slack, which is what stops the hourly
    // sweep from pinging the same video every hour for a day.
    //
    // Spelled out rather than "reminder_1d_sent_at": Kysely's CamelCasePlugin does not
    // round-trip a digit boundary -- it reads that column as `reminder1dSentAt` and writes it
    // back as `reminder1d_sent_at`, which does not exist.
    .addColumn("reminder_day_before_sent_at", "timestamptz")
    .addColumn("reminder_due_sent_at", "timestamptz")
    .addColumn("submitted_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "marketing_video_platform_check",
      sql`platform IN ('youtube_short','tiktok','instagram_reel','instagram_post')`,
    )
    .addCheckConstraint(
      "marketing_video_status_check",
      sql`status IN ('pending','approved','rejected','measured','paid')`,
    )
    // "The first person to submit the video earns the money" is this constraint. It is here
    // rather than only in the handler because two submitters can race the read, and the
    // loser of that race must not end up with a second claim on the same views.
    .addUniqueConstraint("marketing_video_external_key", ["platform", "external_video_id"])
    .execute()

  await db.schema
    .createIndex("marketing_video_business_status_idx")
    .on("marketing_video")
    .columns(["business_id", "status"])
    .execute()

  await db.schema
    .createIndex("marketing_video_submitter_idx")
    .on("marketing_video")
    .columns(["submitter_user_id", "created_at desc"])
    .execute()

  // Partial: the reminder sweep only ever asks about approved videos, and this keeps that
  // hourly query off the rejected and already-paid rows.
  await sql`
    CREATE INDEX marketing_video_measure_at_idx
    ON marketing_video (measure_at)
    WHERE status = 'approved'
  `.execute(db)

  // Where a creator's money goes. Only Stripe's account id lives here -- the connected
  // account holds the bank details, and a dump of this database cannot move a cent.
  await db.schema
    .createTable("payout_account")
    .addColumn("user_id", "uuid", (col) =>
      col.primaryKey().references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("stripe_account_id", "text", (col) => col.notNull().unique())
    .addColumn("charges_enabled", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("payouts_enabled", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("details_submitted", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'pending'`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "payout_account_status_check",
      sql`status IN ('pending','active','restricted')`,
    )
    .execute()

  // One pool per business per month. `pool_usd_cents` is typed in by an admin; the 20% of
  // net profit that the program promises is computed and stored alongside as
  // `suggested_usd_cents` so the two can be compared after the fact.
  await db.schema
    .createTable("marketing_payout_pool")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    // Always the first of the month. This is the month the 30-day windows CLOSED in, not the
    // month the videos were posted, which is what produces the carry-over across February.
    .addColumn("month", "date", (col) => col.notNull())
    .addColumn("pool_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("suggested_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("notes", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'draft'`))
    .addColumn("computed_at", "timestamptz")
    .addColumn("paid_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "marketing_payout_pool_status_check",
      sql`status IN ('draft','locked','paid')`,
    )
    .addUniqueConstraint("marketing_payout_pool_month_key", ["business_id", "month"])
    .execute()

  await db.schema
    .createTable("marketing_payout")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("pool_id", "uuid", (col) =>
      col.references("marketing_payout_pool.id").onDelete("cascade").notNull(),
    )
    .addColumn("video_id", "uuid", (col) =>
      col.references("marketing_video.id").onDelete("cascade").notNull(),
    )
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("cascade").notNull())
    .addColumn("weighted_views", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    /** Hundredths of a percent of the pool. Display only; the cents below are authoritative. */
    .addColumn("share_bp", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("gross_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    // The 20% is inclusive of what Stripe charges, so the fee comes off the creator's share
    // rather than out of the business.
    .addColumn("fee_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("net_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("stripe_transfer_id", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'pending'`))
    .addColumn("failure_reason", "text")
    .addColumn("paid_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "marketing_payout_status_check",
      sql`status IN ('pending','paid','failed','skipped')`,
    )
    // A video is paid at most once out of any one pool, whatever a retried calculation does.
    .addUniqueConstraint("marketing_payout_pool_video_key", ["pool_id", "video_id"])
    .execute()

  await db.schema
    .createIndex("marketing_payout_pool_idx")
    .on("marketing_payout")
    .columns(["pool_id", "status"])
    .execute()

  await db.schema
    .createIndex("marketing_payout_user_idx")
    .on("marketing_payout")
    .columns(["user_id", "created_at desc"])
    .execute()

  // When this creator agreed to the Earn Money terms. Recorded rather than merely enforced
  // in the form: the terms set out how the money is split and how late a manual payout run
  // can be, and "they ticked a box" is only worth anything if we can say when.
  await db.schema.alterTable("user").addColumn("earn_terms_accepted_at", "timestamptz").execute()

  // Someone has to be able to approve videos and press the payout button. No-op on a fresh
  // database where this row does not exist yet, so the migration is safe everywhere.
  await db.updateTable("user").set({ is_admin: true }).where("id", "=", ANDREW_USER_ID).execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.updateTable("user").set({ is_admin: false }).where("id", "=", ANDREW_USER_ID).execute()
  await sql`ALTER TABLE "user" DROP COLUMN IF EXISTS earn_terms_accepted_at`.execute(db)
  await db.schema.dropTable("marketing_payout").ifExists().execute()
  await db.schema.dropTable("marketing_payout_pool").ifExists().execute()
  await db.schema.dropTable("payout_account").ifExists().execute()
  await db.schema.dropTable("marketing_video").ifExists().execute()
}
