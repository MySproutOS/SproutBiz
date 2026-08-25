import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("business")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("owner_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("community_id", "uuid", (col) => col.references("community.id").onDelete("set null"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull())
    .addColumn("tagline", "text")
    .addColumn("description", "text")
    .addColumn("url", "text")
    .addColumn("repo_url", "text")
    .addColumn("platform", "text", (col) => col.notNull().defaultTo(sql`'web'`))
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'active'`))
    .addColumn("launched_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("business_status_check", sql`status IN ('active','paused','shutdown')`)
    .addCheckConstraint("business_platform_check", sql`platform IN ('web','ios','android')`)
    .execute()

  await sql`CREATE UNIQUE INDEX business_slug_lower_key ON business (lower(slug))`.execute(db)
  await db.schema
    .createIndex("business_owner_idx")
    .on("business")
    .columns(["owner_user_id", "created_at desc"])
    .execute()

  // How figures reach us. Credentials themselves are never stored here -- only a reference
  // into whatever secret store holds them -- so a database dump cannot move money.
  await db.schema
    .createTable("business_integration")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("external_account_id", "text")
    .addColumn("secret_ref", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'pending'`))
    .addColumn("last_synced_at", "timestamptz")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "business_integration_provider_check",
      sql`provider IN ('stripe','app_store','play','manual')`,
    )
    .addUniqueConstraint("business_integration_business_provider_key", ["business_id", "provider"])
    .execute()

  // Snapshots rather than a ledger: Stripe, the App Store and Play all report per-period
  // aggregates on different cadences and restate history when refunds and chargebacks land.
  // The unique key makes every sync an idempotent upsert, so a restatement overwrites cleanly
  // instead of double-counting.
  await db.schema
    .createTable("business_revenue_snapshot")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("period_start", "date", (col) => col.notNull())
    .addColumn("period_end", "date", (col) => col.notNull())
    .addColumn("currency", "text", (col) => col.notNull().defaultTo(sql`'USD'`))
    .addColumn("gross_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("refunds_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("fees_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("net_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    // Normalised at write time so aggregates stay plain SUMs rather than FX joins.
    .addColumn("usd_net_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("fx_rate", "numeric(18, 8)", (col) => col.notNull().defaultTo(sql`1`))
    .addColumn("captured_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "business_revenue_snapshot_source_check",
      sql`source IN ('stripe','app_store','play','manual')`,
    )
    .addUniqueConstraint("business_revenue_snapshot_period_key", [
      "business_id",
      "source",
      "period_start",
      "period_end",
    ])
    .execute()

  await db.schema
    .createIndex("business_revenue_snapshot_business_period_idx")
    .on("business_revenue_snapshot")
    .columns(["business_id", "period_start desc"])
    .execute()

  await db.schema
    .createTable("business_cost_snapshot")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("business_id", "uuid", (col) =>
      col.references("business.id").onDelete("cascade").notNull(),
    )
    .addColumn("source", "text", (col) => col.notNull())
    .addColumn("category", "text", (col) => col.notNull())
    .addColumn("period_start", "date", (col) => col.notNull())
    .addColumn("period_end", "date", (col) => col.notNull())
    .addColumn("currency", "text", (col) => col.notNull().defaultTo(sql`'USD'`))
    .addColumn("amount_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("usd_amount_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("fx_rate", "numeric(18, 8)", (col) => col.notNull().defaultTo(sql`1`))
    .addColumn("captured_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "business_cost_snapshot_category_check",
      sql`category IN ('infra','llm','ads','payments','other')`,
    )
    .addUniqueConstraint("business_cost_snapshot_period_key", [
      "business_id",
      "source",
      "category",
      "period_start",
      "period_end",
    ])
    .execute()

  await db.schema
    .createIndex("business_cost_snapshot_business_period_idx")
    .on("business_cost_snapshot")
    .columns(["business_id", "period_start desc"])
    .execute()

  // Pre-aggregated so the landing page is one indexed read rather than a scan over every
  // snapshot ever recorded.
  await db.schema
    .createTable("forum_revenue_daily")
    .addColumn("day", "date", (col) => col.primaryKey())
    .addColumn("total_revenue_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("total_cost_usd_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("business_count", "integer", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("computed_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createTable("donation")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("set null"))
    .addColumn("stripe_checkout_session_id", "text", (col) => col.notNull())
    .addColumn("stripe_payment_intent_id", "text")
    .addColumn("amount_cents", "bigint", (col) => col.notNull().defaultTo(sql`0`))
    .addColumn("currency", "text", (col) => col.notNull().defaultTo(sql`'USD'`))
    .addColumn("status", "text", (col) => col.notNull().defaultTo(sql`'pending'`))
    .addColumn("email", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex("donation_session_key")
    .on("donation")
    .column("stripe_checkout_session_id")
    .unique()
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("donation").ifExists().execute()
  await db.schema.dropTable("forum_revenue_daily").ifExists().execute()
  await db.schema.dropTable("business_cost_snapshot").ifExists().execute()
  await db.schema.dropTable("business_revenue_snapshot").ifExists().execute()
  await db.schema.dropTable("business_integration").ifExists().execute()
  await db.schema.dropTable("business").ifExists().execute()
}
