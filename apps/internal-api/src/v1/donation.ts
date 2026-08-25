import { crudDonation, fetchDonation } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { authNoThrowMiddleware } from "../middleware"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { ErrorCode } from "../utils/errors.enum"
import { throwError } from "../utils/http-exception"
import { DONATION_PRESETS, stripe, stripeWebhookSecret } from "../utils/stripe"
import {
  donationCheckoutSchemaRequest,
  donationCheckoutSchemaResponse,
  donationTotalSchemaResponse,
} from "./donation.serializer"

const app = new Hono()
  .get(
    "/total",
    describeRoute({
      description: "Total donated to the experiment so far",
      responses: {
        200: {
          description: "Donation total",
          content: { "application/json": { schema: resolver(donationTotalSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      return c.json({ totalPaidUsdCents: await fetchDonation(db).totalPaidCents() }, 200)
    },
  )
  .post(
    "/checkout-session",
    // Anonymous donations are allowed, so this cannot require a session.
    authNoThrowMiddleware,
    describeRoute({
      description: "Creates a Stripe Checkout session and returns its URL",
      responses: {
        200: {
          description: "Checkout session created",
          content: { "application/json": { schema: resolver(donationCheckoutSchemaResponse) } },
        },
        503: {
          description: "Donations are not configured",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", donationCheckoutSchemaRequest),
    async (c) => {
      const client = stripe()
      if (!client) {
        return throwError(
          c,
          503,
          ErrorCode.ServiceUnavailable,
          "Donations are not configured on this deployment",
        )
      }

      const { preset } = c.req.valid("json")
      const amountCents = DONATION_PRESETS[preset]
      const host = process.env.NEXT_PUBLIC_HOST_URL ?? "http://localhost:3000"

      const session = await client.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name: "SproutBiz",
                description: "Funds the agents building businesses on SproutBiz.",
              },
            },
          },
        ],
        success_url: `${host}/donate/thanks`,
        cancel_url: `${host}/`,
      })

      // Recorded as pending now so the webhook has a row to settle against; the webhook is
      // the only thing that ever marks a donation paid.
      await crudDonation(db).create({
        userId: c.var.user?.id ?? null,
        stripeCheckoutSessionId: session.id,
        amountCents,
        status: "pending",
      })

      if (!session.url) {
        return throwError(c, 503, ErrorCode.ServiceUnavailable, "Stripe returned no checkout URL")
      }
      return c.json({ url: session.url }, 200)
    },
  )

  .post(
    "/webhook",
    // No auth: the caller is Stripe, and the signature is the credential. Deliberately not
    // behind authNoThrowMiddleware either -- a webhook has no session and no token, and
    // running auth on it would only add a pointless database lookup.
    describeRoute({
      description: "Stripe webhook. Verified by signature; not for client use.",
      responses: {
        200: { description: "Event processed" },
        400: { description: "Bad signature or payload" },
      },
    }),
    async (c) => {
      const client = stripe()
      const secret = stripeWebhookSecret()
      if (!client || !secret) return c.json({ error: "not configured" }, 503)

      const signature = c.req.header("stripe-signature")
      if (!signature) return c.json({ error: "missing signature" }, 400)

      // The signature covers the exact bytes Stripe sent, so this must be the raw body.
      // Anything that re-serialises the JSON first will fail verification.
      const payload = await c.req.text()

      let event: import("stripe").Stripe.Event
      try {
        event = await client.webhooks.constructEventAsync(payload, signature, secret)
      } catch {
        // An unverifiable payload is either a misconfiguration or a forgery. Either way it
        // must never reach the handler below.
        return c.json({ error: "invalid signature" }, 400)
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object
        await crudDonation(db).markPaid(session.id, {
          stripePaymentIntentId:
            typeof session.payment_intent === "string" ? session.payment_intent : null,
          amountCents: session.amount_total ?? 0,
          email: session.customer_details?.email ?? null,
        })
      }

      // Always 200 for a verified event, including ones we ignore: a non-2xx tells Stripe to
      // retry, and retrying an event we simply do not care about is pure noise.
      return c.json({ received: true }, 200)
    },
  )

export default app
