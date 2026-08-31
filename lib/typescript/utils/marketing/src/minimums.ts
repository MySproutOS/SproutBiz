/**
 * Stripe's minimum payout amounts.
 *
 * A creator's earnings reach their Stripe balance as soon as we transfer them -- transfers
 * have no minimum. The minimum here is the one that stops Stripe paying that balance OUT to
 * their bank, so it decides when they can actually hold the money.
 *
 * Stripe's rule is "typically one base unit of the local currency", and the exceptions
 * matter: the US minimum is one CENT, not one dollar. Getting this wrong in the generous
 * direction tells a US creator to wait for $1 they could already have withdrawn; getting it
 * wrong in the other direction promises a payout Stripe will refuse.
 *
 * https://docs.stripe.com/payouts -- "Minimum payout amounts"
 */

/** Minimums in the currency's minor unit (cents, pence, ...). */
const MINIMUM_PAYOUT_MINOR_UNITS: Readonly<Record<string, number>> = {
  usd: 1,
  gbp: 100,
  eur: 100,
  cad: 100,
  aud: 100,
  nzd: 100,
  chf: 100,
  sgd: 100,
  hkd: 100,
  // Zero-decimal currencies: the "minor unit" is the whole unit.
  jpy: 1,
} as const

/** One base unit, for any currency we have not listed. The safe default. */
const DEFAULT_MINIMUM_MINOR_UNITS = 100

export function minimumPayoutMinorUnits(currency: string): number {
  return MINIMUM_PAYOUT_MINOR_UNITS[currency.toLowerCase()] ?? DEFAULT_MINIMUM_MINOR_UNITS
}

/** Zero-decimal currencies have no fractional part to format. */
const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "isk", "ugx", "xaf", "xof", "xpf"])

export function formatMinorUnits(amount: number, currency: string): string {
  const lower = currency.toLowerCase()
  const fractionDigits = ZERO_DECIMAL.has(lower) ? 0 : 2
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(ZERO_DECIMAL.has(lower) ? amount : amount / 100)
}

/** How often Stripe pays a connected account's balance out to their bank. */
export type PayoutInterval = "daily" | "weekly" | "monthly" | "manual"

export const PAYOUT_INTERVALS: readonly PayoutInterval[] = [
  "daily",
  "weekly",
  "monthly",
  "manual",
] as const

export function isPayoutInterval(value: string): value is PayoutInterval {
  return (PAYOUT_INTERVALS as readonly string[]).includes(value)
}
