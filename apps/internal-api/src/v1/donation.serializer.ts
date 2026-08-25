import { Type } from "typebox"

export const donationCheckoutSchemaRequest = Type.Object({
  preset: Type.Union([Type.Literal("small"), Type.Literal("medium"), Type.Literal("large")]),
})

export const donationCheckoutSchemaResponse = Type.Object({
  url: Type.String(),
})

export const donationTotalSchemaResponse = Type.Object({
  totalPaidUsdCents: Type.Number(),
})
