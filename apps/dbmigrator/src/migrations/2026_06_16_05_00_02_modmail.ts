import { type Kysely, sql } from "kysely"

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("modmail_conversation")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("community_id", "uuid", (col) =>
      col.references("community.id").onDelete("cascade").notNull(),
    )
    .addColumn("subject", "text", (col) => col.notNull())
    .addColumn("participant_user_id", "uuid", (col) =>
      col.references("user.id").onDelete("cascade").notNull(),
    )
    .addColumn("folder", "text", (col) => col.notNull().defaultTo(sql`'new'`))
    .addColumn("is_highlighted", "boolean", (col) => col.notNull().defaultTo(sql`false`))
    .addColumn("last_message_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "modmail_conversation_folder_check",
      sql`folder IN ('new', 'in_progress', 'archived')`,
    )
    .execute()

  await db.schema
    .createIndex("modmail_conversation_community_idx")
    .on("modmail_conversation")
    .columns(["community_id", "folder", "last_message_at desc"])
    .execute()
  await db.schema
    .createIndex("modmail_conversation_participant_idx")
    .on("modmail_conversation")
    .column("participant_user_id")
    .execute()

  await db.schema
    .createTable("modmail_message")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("conversation_id", "uuid", (col) =>
      col.references("modmail_conversation.id").onDelete("cascade").notNull(),
    )
    .addColumn("author_user_id", "uuid", (col) => col.references("user.id").onDelete("set null"))
    .addColumn("body_md", "text", (col) => col.notNull())
    .addColumn("is_internal_note", "boolean", (col) => col.notNull().defaultTo(sql`false`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute()

  await db.schema
    .createIndex("modmail_message_conversation_idx")
    .on("modmail_message")
    .columns(["conversation_id", "created_at"])
    .execute()
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("modmail_message").ifExists().execute()
  await db.schema.dropTable("modmail_conversation").ifExists().execute()
}
