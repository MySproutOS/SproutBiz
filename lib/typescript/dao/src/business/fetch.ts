import type { DB } from "@template-nextjs/db"
import type { Kysely, Selectable } from "kysely"

/**
 * A business with its revenue and costs already summed.
 *
 * Money is exposed as `number` rather than the string Kysely returns for bigint: the
 * conversion happens once, here, instead of at every call site. Cents in a JS number stay
 * exact past 90 trillion dollars, which is comfortably beyond what this forum will report.
 */
export type BusinessWithTotals = {
  id: string
  name: string
  slug: string
  tagline: string | null
  url: string | null
  repoUrl: string | null
  platform: string
  status: string
  launchedAt: Date | null
  revenueUsdCents: number
  costUsdCents: number
  netUsdCents: number
  /** True when every figure came from a provider sync rather than being self-reported. */
  verified: boolean
}

export function fetchBusiness(db: Kysely<DB>) {
  async function getOne<T extends (keyof DB["business"])[]>(
    id: string,
    fields: T,
  ): Promise<Pick<Selectable<DB["business"]>, T[number]> | undefined> {
    return await db.selectFrom("business").select(fields).where("id", "=", id).executeTakeFirst()
  }

  async function getOneBySlug<T extends (keyof DB["business"])[]>(
    slug: string,
    fields: T,
  ): Promise<Pick<Selectable<DB["business"]>, T[number]> | undefined> {
    return await db
      .selectFrom("business")
      .select(fields)
      .where("slug", "=", slug)
      .executeTakeFirst()
  }

  /** One grouped query rather than a per-business round trip. */
  async function listWithTotals(limit = 100): Promise<BusinessWithTotals[]> {
    const rows = await db
      .selectFrom("business")
      .leftJoin(
        (eb) =>
          eb
            .selectFrom("businessRevenueSnapshot")
            .select((e) => [
              "businessId",
              e.fn.sum<string>("usdNetCents").as("revenue"),
              // Postgres bool_and over "is this row from a provider" tells us whether the
              // whole total can be trusted without a second query.
              e.fn.count<string>("id").filterWhere("source", "=", "manual").as("manualCount"),
            ])
            .groupBy("businessId")
            .as("rev"),
        (join) => join.onRef("rev.businessId", "=", "business.id"),
      )
      .leftJoin(
        (eb) =>
          eb
            .selectFrom("businessCostSnapshot")
            .select((e) => ["businessId", e.fn.sum<string>("usdAmountCents").as("cost")])
            .groupBy("businessId")
            .as("cost"),
        (join) => join.onRef("cost.businessId", "=", "business.id"),
      )
      .select([
        "business.id",
        "business.name",
        "business.slug",
        "business.tagline",
        "business.url",
        "business.repoUrl",
        "business.platform",
        "business.status",
        "business.launchedAt",
        "rev.revenue",
        "rev.manualCount",
        "cost.cost",
      ])
      .orderBy("rev.revenue", "desc")
      .orderBy("business.createdAt", "desc")
      .limit(limit)
      .execute()

    return rows.map((row) => {
      const revenueUsdCents = Number(row.revenue ?? 0)
      const costUsdCents = Number(row.cost ?? 0)
      return {
        id: row.id,
        name: row.name,
        slug: row.slug,
        tagline: row.tagline,
        url: row.url,
        repoUrl: row.repoUrl,
        platform: row.platform,
        status: row.status,
        launchedAt: row.launchedAt,
        revenueUsdCents,
        costUsdCents,
        netUsdCents: revenueUsdCents - costUsdCents,
        verified: Number(row.manualCount ?? 0) === 0,
      }
    })
  }

  return { getOne, getOneBySlug, listWithTotals }
}
