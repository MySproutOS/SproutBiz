import { createHmac, timingSafeEqual } from "node:crypto"
import { crudGithubWebhookDelivery } from "@lib/dao"
import { db } from "@template-nextjs/db"
import type { Json } from "@template-nextjs/db"
import { enqueueGithubWebhook } from "@utils/queues"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver } from "hono-typebox-openapi/typebox"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { throwBadRequest, throwUnauthenticated } from "../utils/http-exception"
import { githubWebhookSchemaResponse } from "./github.serializer"

function validSignature(body: string, signature: string | undefined): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret || !signature?.startsWith("sha256=")) return false
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`)
  const actual = Buffer.from(signature)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const app = new Hono().post(
  "/webhook",
  describeRoute({
    security: [],
    description: "Receives signed GitHub App webhooks for contribution attribution",
    responses: {
      202: {
        description: "Delivery persisted for asynchronous processing",
        content: { "application/json": { schema: resolver(githubWebhookSchemaResponse) } },
      },
      401: {
        description: "Signature rejected",
        content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
      },
    },
  }),
  async (c) => {
    const raw = await c.req.text()
    if (!validSignature(raw, c.req.header("x-hub-signature-256"))) {
      return throwUnauthenticated(c, "Invalid GitHub webhook signature")
    }
    const deliveryId = c.req.header("x-github-delivery")
    const eventName = c.req.header("x-github-event")
    if (!deliveryId || !eventName) return throwBadRequest(c, "Missing GitHub delivery headers")
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(raw) as Record<string, unknown>
    } catch {
      return throwBadRequest(c, "Invalid GitHub webhook JSON")
    }
    const repository = payload.repository as { id?: number } | undefined
    const inserted = await crudGithubWebhookDelivery(db).receive({
      deliveryId,
      eventName,
      action: typeof payload.action === "string" ? payload.action : null,
      githubRepositoryId: repository?.id === undefined ? null : String(repository.id),
      payload: payload as Json,
    })
    if (inserted) await enqueueGithubWebhook(deliveryId)
    return c.json({ accepted: true }, 202)
  },
)

export default app
