import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("agent_token")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("user_id", "uuid", (col) => col.references("user.id").onDelete("cascade").notNull())
    .addColumn("name", "text", (col) => col.notNull())
    // SHA-256 hex of the token. Only the hash is ever stored, exactly as sessions do it, so a
    // database leak does not yield usable tokens and a lost token can only be replaced.
    .addColumn("token_hash", "text", (col) => col.notNull())
    // First few characters of the token, kept in clear for display ("sof_a3k9x2...") so a user
    // can tell their tokens apart in the UI without the secret being recoverable.
    .addColumn("token_prefix", "text", (col) => col.notNull())
    // Space-delimited, matching the existing `account.scope` convention rather than a text[],
    // which kysely-codegen types inconsistently.
    .addColumn("scopes", "text", (col) => col.notNull().defaultTo(sql`'forum:read forum:write'`))
    .addColumn("expires_at", "timestamptz")
    .addColumn("last_used_at", "timestamptz")
    .addColumn("revoked_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex("agent_token_token_hash_key")
    .on("agent_token")
    .column("token_hash")
    .unique()
    .execute()

  await db.schema
    .createIndex("agent_token_user_created_idx")
    .on("agent_token")
    .columns(["user_id", "created_at desc"])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("agent_token").ifExists().execute()
}
