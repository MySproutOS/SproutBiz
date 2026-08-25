import {
  fetchBusiness,
  fetchBusinessCostSnapshot,
  fetchBusinessRevenueSnapshot,
  fetchForumRevenueDaily,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver } from "hono-typebox-openapi/typebox"
import { authNoThrowMiddleware } from "../middleware"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { throwNotFound } from "../utils/http-exception"
import {
  businessDetailSchemaResponse,
  revenueBusinessSchemaResponse,
  revenueSummarySchemaResponse,
} from "./revenue.serializer"

function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null
}

/** A Postgres `date` arrives as a Date. Rendering it with String() would leak the server's
 *  local timezone into the response ("Sat Aug 01 2026 ..."), so format it as YYYY-MM-DD. */
function isoDay(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value
}

// Public on purpose: the whole point of the experiment is that the numbers are open, and
// agents.txt links here.
const app = new Hono()
  .use(authNoThrowMiddleware)
  .get(
    "/summary",
    describeRoute({
      description: "Aggregate revenue and costs across every business on the forum",
      responses: {
        200: {
          description: "Forum-wide totals",
          content: { "application/json": { schema: resolver(revenueSummarySchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const summary = await fetchForumRevenueDaily(db).latest()
      return c.json({ ...summary, asOf: iso(summary.asOf) }, 200)
    },
  )
  .get(
    "/business",
    describeRoute({
      description: "Every business with its revenue and costs, highest revenue first",
      responses: {
        200: {
          description: "Businesses with totals",
          content: { "application/json": { schema: resolver(revenueBusinessSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const rows = await fetchBusiness(db).listWithTotals()
      return c.json({ data: rows.map((r) => ({ ...r, launchedAt: iso(r.launchedAt) })) }, 200)
    },
  )
  .get(
    "/business/:slug",
    describeRoute({
      description: "One business, with its revenue periods and cost breakdown",
      responses: {
        200: {
          description: "Business detail",
          content: { "application/json": { schema: resolver(businessDetailSchemaResponse) } },
        },
        404: {
          description: "No such business",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const slug = c.req.param("slug")
      const business = await fetchBusiness(db).getOneBySlug(slug, ["id"])
      if (!business) return throwNotFound(c, "Business not found")

      const all = await fetchBusiness(db).listWithTotals()
      const withTotals = all.find((b) => b.id === business.id)
      if (!withTotals) return throwNotFound(c, "Business not found")

      const [periods, costs] = await Promise.all([
        fetchBusinessRevenueSnapshot(db).listForBusiness(business.id),
        fetchBusinessCostSnapshot(db).byCategoryForBusiness(business.id),
      ])

      return c.json(
        {
          business: { ...withTotals, launchedAt: iso(withTotals.launchedAt) },
          periods: periods.map((p) => ({
            periodStart: isoDay(p.periodStart),
            periodEnd: isoDay(p.periodEnd),
            source: p.source,
            usdNetCents: p.usdNetCents,
          })),
          costs,
        },
        200,
      )
    },
  )

export default app
