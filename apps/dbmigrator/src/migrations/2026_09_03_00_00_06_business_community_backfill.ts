import type { Kysely } from "kysely"
import { v5, v7 } from "uuid"

function baseCommunityName(slug: string): string {
  const normalized = slug.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 21)
  if (normalized.length >= 3) return normalized
  return `biz_${normalized}`.slice(0, 21)
}

async function availableCommunityName(db: Kysely<any>, slug: string): Promise<string> {
  const base = baseCommunityName(slug)
  for (let attempt = 1; ; attempt += 1) {
    const suffix = attempt === 1 ? "" : `_${attempt}`
    const name = `${base.slice(0, 21 - suffix.length)}${suffix}`
    const existing = await db
      .selectFrom("community")
      .select("id")
      .where("name", "ilike", name)
      .executeTakeFirst()
    if (existing === undefined) return name
  }
}

export async function up(db: Kysely<any>): Promise<void> {
  const businesses = await db
    .selectFrom("business")
    .select(["id", "ownerUserId", "name", "slug", "description"])
    .where("communityId", "is", null)
    .execute()

  for (const business of businesses) {
    const communityId = v5(`sproutbiz:business-community:${business.id}`, v5.URL)
    await db
      .insertInto("community")
      .values({
        id: communityId,
        name: await availableCommunityName(db, String(business.slug)),
        display_name: business.name,
        description: business.description ?? `Contributions to ${business.name}`,
        visibility: "public",
        createdByUserId: business.ownerUserId,
        memberCount: 1,
      })
      .execute()
    await db
      .insertInto("communityMember")
      .values({ id: v7(), communityId, userId: business.ownerUserId })
      .execute()
    await db
      .insertInto("communityModerator")
      .values({
        id: v7(),
        communityId,
        userId: business.ownerUserId,
        position: 0,
        permEverything: true,
      })
      .execute()
    await db
      .updateTable("business")
      .set({ communityId })
      .where("id", "=", business.id)
      .where("communityId", "is", null)
      .execute()
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  const businesses = await db.selectFrom("business").select(["id", "communityId"]).execute()
  for (const business of businesses) {
    const communityId = v5(`sproutbiz:business-community:${business.id}`, v5.URL)
    if (business.communityId !== communityId) continue
    await db
      .updateTable("business")
      .set({ communityId: null })
      .where("id", "=", business.id)
      .execute()
    await db.deleteFrom("community").where("id", "=", communityId).execute()
  }
}
