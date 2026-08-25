import {
  crudBusiness,
  crudBusinessCostSnapshot,
  crudBusinessRevenueSnapshot,
  fetchBusiness,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { authMiddleware, requireScope } from "../middleware"
import { EmptyObject, ErrorSchemaResponse, IdParamT } from "../utils/common.serializer"
import { ErrorCode } from "../utils/errors.enum"
import { throwError, throwForbidden, throwNotFound } from "../utils/http-exception"
import {
  businessCostReportSchemaRequest,
  businessCreatedSchemaResponse,
  businessRevenueReportSchemaRequest,
  businessSchemaRequest,
} from "./revenue.serializer"

async function assertOwner(id: string, userId: string): Promise<boolean> {
  const row = await fetchBusiness(db).getOne(id, ["ownerUserId"])
  return row?.ownerUserId === userId
}

const app = new Hono()
  .use(authMiddleware)
  .use(requireScope("business:write"))
  .post(
    "/",
    describeRoute({
      description: "Registers a business so its revenue appears on /revenue",
      responses: {
        201: {
          description: "The created business",
          content: { "application/json": { schema: resolver(businessCreatedSchemaResponse) } },
        },
        409: {
          description: "That slug is taken",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", businessSchemaRequest),
    async (c) => {
      const body = c.req.valid("json")
      const existing = await fetchBusiness(db).getOneBySlug(body.slug, ["id"])
      if (existing) {
        return throwError(c, 409, ErrorCode.Conflict, "A business with that slug already exists")
      }

      const business = await crudBusiness(db).create({
        ownerUserId: c.var.user.id,
        name: body.name,
        slug: body.slug,
        tagline: body.tagline ?? null,
        description: body.description ?? null,
        url: body.url ?? null,
        repoUrl: body.repoUrl ?? null,
        platform: body.platform ?? "web",
      })
      return c.json({ id: business.id, name: business.name, slug: business.slug }, 201)
    },
  )
  .post(
    "/:id/revenue",
    describeRoute({
      description:
        "Reports revenue for a period. Recorded as self-reported and labelled as such on /revenue until a payment provider is connected.",
      responses: {
        200: {
          description: "Recorded",
          content: { "application/json": { schema: resolver(EmptyObject) } },
        },
        403: {
          description: "Not your business",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", businessRevenueReportSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const body = c.req.valid("json")
      if (!(await assertOwner(id, c.var.user.id))) {
        return throwForbidden(c, "You do not own this business")
      }

      await crudBusinessRevenueSnapshot(db).upsert({
        businessId: id,
        // Never "stripe": a figure the owner typed in must not be indistinguishable from one
        // the payment provider confirmed.
        source: "manual",
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        usdNetCents: body.usdNetCents,
        netCents: body.usdNetCents,
        grossCents: body.usdNetCents,
      })
      return c.json({}, 200)
    },
  )
  .post(
    "/:id/cost",
    describeRoute({
      description: "Reports costs for a period. There is no automated source for these.",
      responses: {
        200: {
          description: "Recorded",
          content: { "application/json": { schema: resolver(EmptyObject) } },
        },
        403: {
          description: "Not your business",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", businessCostReportSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const body = c.req.valid("json")
      if (!(await assertOwner(id, c.var.user.id))) {
        return throwForbidden(c, "You do not own this business")
      }

      await crudBusinessCostSnapshot(db).upsert({
        businessId: id,
        source: "manual",
        category: body.category,
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        usdAmountCents: body.usdAmountCents,
        amountCents: body.usdAmountCents,
      })
      return c.json({}, 200)
    },
  )
  .delete(
    "/:id",
    describeRoute({
      description: "Deletes a business and its recorded figures",
      responses: {
        200: {
          description: "Deleted",
          content: { "application/json": { schema: resolver(EmptyObject) } },
        },
        404: {
          description: "No such business",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    async (c) => {
      const { id } = c.req.valid("param")
      const deleted = await crudBusiness(db).deleteOwn(id, c.var.user.id)
      if (!deleted) return throwNotFound(c, "Business not found")
      return c.json({}, 200)
    },
  )

export default app
