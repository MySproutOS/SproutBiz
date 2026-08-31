import { Type } from "typebox"
import { Nullable } from "../utils/common.serializer"

export const payoutAccountSchemaResponse = Type.Object({
  data: Type.Object({
    /** False until the creator has started Stripe's onboarding at least once. */
    linked: Type.Boolean(),
    stripeAccountId: Nullable(Type.String()),
    status: Type.String(),
    chargesEnabled: Type.Boolean(),
    /** The only flag that decides whether we can actually send this person money. */
    payoutsEnabled: Type.Boolean(),
    detailsSubmitted: Type.Boolean(),
    /** The settlement currency Stripe will pay them in, lowercase. */
    currency: Type.String(),
    /** Stripe will not pay out to a bank below this, in the currency's minor unit. */
    minimumPayoutMinorUnits: Type.Number(),
    /** "daily" | "weekly" | "monthly" | "manual". Manual means they press the button. */
    payoutInterval: Type.String(),
    /** Sitting in their Stripe account, ready to be paid out. */
    availableMinorUnits: Type.Number(),
    /** On its way but not yet available to pay out. */
    pendingMinorUnits: Type.Number(),
  }),
})

export const payoutScheduleSchemaRequest = Type.Object({
  interval: Type.Union([
    Type.Literal("daily"),
    Type.Literal("weekly"),
    Type.Literal("monthly"),
    Type.Literal("manual"),
  ]),
})

export const payoutCreateSchemaResponse = Type.Object({
  payoutId: Type.String(),
  amountMinorUnits: Type.Number(),
  currency: Type.String(),
})

export const payoutAccountLinkSchemaResponse = Type.Object({
  url: Type.String(),
})
