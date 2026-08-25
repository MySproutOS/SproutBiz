import { db } from "@template-nextjs/db"
import { v7 } from "uuid"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { crudDonation } from "./crud"
import { fetchDonation } from "./fetch"

const suffix = v7().slice(0, 8)
const sessionId = `cs_test_${suffix}`

beforeAll(async () => {
  await db.deleteFrom("donation").execute()
})

afterAll(async () => {
  await db.deleteFrom("donation").execute()
  await db.destroy()
})

describe("donation settlement", () => {
  it("only counts donations the webhook has settled", async () => {
    await crudDonation(db).create({
      stripeCheckoutSessionId: sessionId,
      amountCents: 2500,
      status: "pending",
    })
    // A checkout that was started but never paid must not show up in the total.
    expect(await fetchDonation(db).totalPaidCents()).toBe(0)

    const settled = await crudDonation(db).markPaid(sessionId, {
      stripePaymentIntentId: "pi_test_123",
      amountCents: 2500,
      email: "donor@example.invalid",
    })
    expect(settled).toBe(true)
    expect(await fetchDonation(db).totalPaidCents()).toBe(2500)
  })

  it("is idempotent, because Stripe retries and does not promise exactly-once delivery", async () => {
    await crudDonation(db).markPaid(sessionId, {
      stripePaymentIntentId: "pi_test_123",
      amountCents: 2500,
      email: "donor@example.invalid",
    })
    // Replaying the same event must not double the total.
    expect(await fetchDonation(db).totalPaidCents()).toBe(2500)
  })

  it("ignores an event for a session it does not know about", async () => {
    const settled = await crudDonation(db).markPaid("cs_test_never_seen", {
      stripePaymentIntentId: null,
      amountCents: 999_999,
      email: null,
    })
    expect(settled).toBe(false)
    expect(await fetchDonation(db).totalPaidCents()).toBe(2500)
  })
})
