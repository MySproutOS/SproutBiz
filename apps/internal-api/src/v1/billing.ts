import { crudPayoutAccount, fetchPayoutAccount } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { isPayoutInterval, minimumPayoutMinorUnits } from "@utils/marketing"
import type { Stripe } from "stripe"
import { authMiddleware, cookieSessionOnlyMiddleware } from "../middleware"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { ErrorCode } from "../utils/errors.enum"
import { throwError, throwNotFound } from "../utils/http-exception"
import { stripe, stripeWebhookSecret } from "../utils/stripe"
import {
  payoutAccountLinkSchemaResponse,
  payoutAccountSchemaResponse,
  payoutCreateSchemaResponse,
  payoutScheduleSchemaRequest,
} from "./billing.serializer"

const HOST_URL = process.env.NEXT_PUBLIC_HOST_URL ?? "http://localhost:3000"

const PAYOUTS_UNCONFIGURED = "Payouts are not configured on this deployment"

type StoredAccount = {
  stripeAccountId: string
  status: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
}

/** What Stripe knows that our table does not: currency, schedule, and live balance. */
type LiveAccount = {
  currency: string
  payoutInterval: string
  availableMinorUnits: number
  pendingMinorUnits: number
}

const DEFAULT_LIVE: LiveAccount = {
  currency: "usd",
  payoutInterval: "manual",
  availableMinorUnits: 0,
  pendingMinorUnits: 0,
}

function serializeAccount(row: StoredAccount | null, live: LiveAccount = DEFAULT_LIVE) {
  const base = { ...live, minimumPayoutMinorUnits: minimumPayoutMinorUnits(live.currency) }
  if (row === null) {
    return {
      ...base,
      linked: false,
      stripeAccountId: null,
      status: "pending",
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    }
  }
  return {
    ...base,
    linked: true,
    stripeAccountId: row.stripeAccountId,
    status: row.status,
    chargesEnabled: row.chargesEnabled,
    payoutsEnabled: row.payoutsEnabled,
    detailsSubmitted: row.detailsSubmitted,
  }
}

/**
 * Reads the currency, payout schedule and balance from Stripe.
 *
 * Never throws: this only enriches the page. A Stripe blip should cost the balance readout,
 * not the answer to "is my account connected at all".
 */
async function readLive(client: Stripe, stripeAccountId: string): Promise<LiveAccount> {
  try {
    const [account, balance] = await Promise.all([
      client.accounts.retrieve(stripeAccountId),
      client.balance.retrieve({}, { stripeAccount: stripeAccountId }),
    ])
    const currency = account.default_currency ?? "usd"
    const pick = (entries: { currency: string; amount: number }[] | undefined) =>
      entries?.find((entry) => entry.currency === currency)?.amount ?? 0
    return {
      currency,
      payoutInterval: account.settings?.payouts?.schedule?.interval ?? "manual",
      availableMinorUnits: pick(balance.available),
      pendingMinorUnits: pick(balance.pending),
    }
  } catch (error) {
    console.error("[billing] could not read live account state:", error)
    return DEFAULT_LIVE
  }
}

const webhook = new Hono().post(
  "/webhook",
  // No auth: the caller is Stripe and the signature is the credential. Same reasoning as the
  // donation webhook, which this deliberately mirrors.
  describeRoute({
    description: "Stripe Connect webhook. Verified by signature; not for client use.",
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

    // Must be the exact bytes Stripe sent -- re-serialising the JSON breaks verification.
    const payload = await c.req.text()

    let event: Stripe.Event
    try {
      event = await client.webhooks.constructEventAsync(payload, signature, secret)
    } catch {
      return c.json({ error: "invalid signature" }, 400)
    }

    if (event.type === "account.updated") {
      const account = event.data.object
      await crudPayoutAccount(db).syncFromStripe(account.id, {
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
      })
    }

    // 200 even for events we ignore: a non-2xx asks Stripe to retry them forever.
    return c.json({ received: true }, 200)
  },
)

const app = new Hono()
  .route("/", webhook)
  // Everything below moves money or creates the account that receives it. Cookie sessions
  // only: agent tokens are handed to third-party agents, and no scope on one should ever add
  // up to attaching a bank account to somebody's forum identity.
  .use(authMiddleware)
  .use(cookieSessionOnlyMiddleware)
  .get(
    "/payout-account",
    describeRoute({
      description: "Whether you can be paid, and what Stripe still wants from you",
      responses: {
        200: {
          description: "Payout account state",
          content: { "application/json": { schema: resolver(payoutAccountSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const account = await fetchPayoutAccount(db).getForUser(c.var.user.id)
      const client = stripe()
      if (!account || !client) {
        return c.json({ data: serializeAccount(account ?? null) }, 200)
      }
      const live = await readLive(client, account.stripeAccountId)
      return c.json({ data: serializeAccount(account, live) }, 200)
    },
  )
  .post(
    "/payout-account/onboarding-link",
    describeRoute({
      description: "Creates (or reuses) your Stripe Express account and returns its onboarding URL",
      responses: {
        200: {
          description: "Onboarding link",
          content: { "application/json": { schema: resolver(payoutAccountLinkSchemaResponse) } },
        },
        503: {
          description: "Payouts are not configured on this deployment",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const client = stripe()
      if (!client) {
        return throwError(c, 503, ErrorCode.ServiceUnavailable, PAYOUTS_UNCONFIGURED)
      }

      const user = c.var.user
      let account = await fetchPayoutAccount(db).getForUser(user.id)

      try {
        if (!account) {
          // Express rather than Standard: the creator gets a Stripe-hosted onboarding flow
          // and dashboard, and we never handle their bank details or identity documents.
          const created = await client.accounts.create({
            type: "express",
            email: user.email ?? undefined,
            capabilities: { transfers: { requested: true } },
            business_type: "individual",
            metadata: { forumUserId: user.id, forumUsername: user.username },
          })
          account = await crudPayoutAccount(db).create(user.id, created.id)
        }

        // Account links are single-use and short-lived, so one is minted per click rather
        // than stored. `refresh_url` is where Stripe sends someone whose link went stale.
        const link = await client.accountLinks.create({
          account: account.stripeAccountId,
          refresh_url: `${HOST_URL}/billing?refresh=1`,
          return_url: `${HOST_URL}/billing?return=1`,
          type: "account_onboarding",
        })

        return c.json({ url: link.url }, 200)
      } catch (error) {
        // Connect not being signed up for on the platform account is the expected shape of
        // this failure, and it is a deployment state rather than a bug in the request.
        // Degrade the way the donate button does instead of returning a 500 to someone who
        // did nothing wrong.
        console.error("[billing] Stripe Connect onboarding failed:", error)
        return throwError(
          c,
          503,
          ErrorCode.ServiceUnavailable,
          "Payouts are not available yet. Stripe Connect is not enabled on this deployment.",
        )
      }
    },
  )
  .post(
    "/payout-account/refresh",
    describeRoute({
      description: "Re-reads your account from Stripe, for when the webhook has not landed yet",
      responses: {
        200: {
          description: "Payout account state",
          content: { "application/json": { schema: resolver(payoutAccountSchemaResponse) } },
        },
        503: {
          description: "Payouts are not configured on this deployment",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const client = stripe()
      if (!client) {
        return throwError(c, 503, ErrorCode.ServiceUnavailable, PAYOUTS_UNCONFIGURED)
      }

      const existing = await fetchPayoutAccount(db).getForUser(c.var.user.id)
      if (!existing) {
        return c.json({ data: serializeAccount(null) }, 200)
      }

      const account = await client.accounts.retrieve(existing.stripeAccountId)
      const updated = await crudPayoutAccount(db).syncFromStripe(account.id, {
        chargesEnabled: account.charges_enabled ?? false,
        payoutsEnabled: account.payouts_enabled ?? false,
        detailsSubmitted: account.details_submitted ?? false,
      })
      const live = await readLive(client, existing.stripeAccountId)
      return c.json({ data: serializeAccount(updated ?? existing, live) }, 200)
    },
  )
  .put(
    "/payout-account/schedule",
    describeRoute({
      description: "Chooses whether Stripe pays your balance out automatically or on request",
      responses: {
        200: {
          description: "Payout account state",
          content: { "application/json": { schema: resolver(payoutAccountSchemaResponse) } },
        },
        503: {
          description: "Payouts are not configured on this deployment",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", payoutScheduleSchemaRequest),
    async (c) => {
      const client = stripe()
      if (!client) {
        return throwError(c, 503, ErrorCode.ServiceUnavailable, PAYOUTS_UNCONFIGURED)
      }
      const { interval } = c.req.valid("json")
      if (!isPayoutInterval(interval)) {
        return throwError(c, 400, ErrorCode.InvalidInput, "Unknown payout interval")
      }
      const existing = await fetchPayoutAccount(db).getForUser(c.var.user.id)
      if (!existing) {
        return throwNotFound(c, "You have not connected a Stripe account yet")
      }

      try {
        await client.accounts.update(existing.stripeAccountId, {
          settings: { payouts: { schedule: { interval } } },
        })
      } catch (error) {
        console.error("[billing] could not set payout schedule:", error)
        return throwError(
          c,
          503,
          ErrorCode.ServiceUnavailable,
          "Stripe would not accept that payout schedule.",
        )
      }

      const live = await readLive(client, existing.stripeAccountId)
      return c.json({ data: serializeAccount(existing, live) }, 200)
    },
  )
  .post(
    "/payout-account/payout",
    describeRoute({
      description: "Pays your available Stripe balance out to your bank now",
      responses: {
        200: {
          description: "Payout created",
          content: { "application/json": { schema: resolver(payoutCreateSchemaResponse) } },
        },
        400: {
          description: "Balance is below Stripe's minimum payout amount",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const client = stripe()
      if (!client) {
        return throwError(c, 503, ErrorCode.ServiceUnavailable, PAYOUTS_UNCONFIGURED)
      }
      const existing = await fetchPayoutAccount(db).getForUser(c.var.user.id)
      if (!existing) {
        return throwNotFound(c, "You have not connected a Stripe account yet")
      }

      const live = await readLive(client, existing.stripeAccountId)
      const minimum = minimumPayoutMinorUnits(live.currency)
      // Checked before calling Stripe so the person gets the actual number they need rather
      // than Stripe's generic refusal.
      if (live.availableMinorUnits < minimum) {
        return throwError(
          c,
          400,
          ErrorCode.InvalidInput,
          `Stripe will not pay out less than ${minimum} ${live.currency.toUpperCase()} minor units. Your available balance is ${live.availableMinorUnits}.`,
        )
      }

      try {
        const payout = await client.payouts.create(
          { amount: live.availableMinorUnits, currency: live.currency },
          { stripeAccount: existing.stripeAccountId },
        )
        return c.json(
          {
            payoutId: payout.id,
            amountMinorUnits: payout.amount,
            currency: payout.currency,
          },
          200,
        )
      } catch (error) {
        console.error("[billing] payout failed:", error)
        return throwError(
          c,
          400,
          ErrorCode.InvalidInput,
          error instanceof Error ? error.message : "Stripe refused the payout.",
        )
      }
    },
  )

export default app
