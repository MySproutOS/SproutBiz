/**
 * Dividing a pool between creators.
 *
 * The 20% set aside is inclusive of what Stripe charges to move the money, so the fee comes
 * off each creator's share rather than out of a business's pocket. That is why a creator
 * receives slightly less than their raw percentage of the pool -- said plainly on /earn.
 */

/**
 * Stripe's Express payout cost, as a proportion and a flat amount.
 *
 * Transfers to a connected account are free; the charge lands when that account pays out to
 * a bank. Overridable so a change in Stripe's pricing does not need a code deploy.
 */
export const PAYOUT_FEE_BPS = numberFromEnv("MARKETING_PAYOUT_FEE_BPS", 25)
export const PAYOUT_FEE_FLAT_CENTS = numberFromEnv("MARKETING_PAYOUT_FEE_FLAT_CENTS", 25)

function numberFromEnv(name: string, fallback: number): number {
  const raw = typeof process === "undefined" ? undefined : process.env?.[name]
  if (raw === undefined || raw === "") return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export function payoutFeeCents(grossCents: number): number {
  if (grossCents <= 0) return 0
  const fee = Math.ceil((grossCents * PAYOUT_FEE_BPS) / 10_000) + PAYOUT_FEE_FLAT_CENTS
  // Never charge more than the payout itself is worth.
  return Math.min(fee, grossCents)
}

export type SplitEntry = {
  videoId: string
  userId: string
  weightedViews: number
}

export type SplitShare = SplitEntry & {
  /** Hundredths of a percent of the pool. Display only -- the cents below are authoritative. */
  shareBp: number
  grossUsdCents: number
  feeUsdCents: number
  netUsdCents: number
}

/**
 * Splits `poolUsdCents` across entries in proportion to weighted views.
 *
 * Floor-then-distribute rather than round: rounding each share independently can hand out
 * more than the pool holds, which would mean transferring money that was never set aside.
 * Every share is floored, and the few leftover cents go to the largest share. The sum of
 * `grossUsdCents` therefore equals the pool exactly whenever anyone is eligible at all.
 */
export function splitPool(poolUsdCents: number, entries: SplitEntry[]): SplitShare[] {
  const eligible = entries.filter((e) => e.weightedViews > 0)
  const totalWeighted = eligible.reduce((sum, e) => sum + e.weightedViews, 0)
  if (poolUsdCents <= 0 || totalWeighted === 0) {
    return entries.map((e) => ({
      ...e,
      shareBp: 0,
      grossUsdCents: 0,
      feeUsdCents: 0,
      netUsdCents: 0,
    }))
  }

  const shares = eligible.map((entry) => {
    const grossUsdCents = Math.floor((poolUsdCents * entry.weightedViews) / totalWeighted)
    return {
      ...entry,
      shareBp: Math.round((entry.weightedViews / totalWeighted) * 10_000),
      grossUsdCents,
      feeUsdCents: 0,
      netUsdCents: 0,
    }
  })

  let remainder = poolUsdCents - shares.reduce((sum, s) => sum + s.grossUsdCents, 0)
  if (remainder > 0) {
    // Deterministic: biggest share first, ties broken by id so a recalculation of the same
    // pool always produces the same rows.
    const order = [...shares].toSorted(
      (a, b) => b.weightedViews - a.weightedViews || a.videoId.localeCompare(b.videoId),
    )
    for (let i = 0; remainder > 0; i = (i + 1) % order.length) {
      order[i].grossUsdCents += 1
      remainder -= 1
    }
  }

  for (const share of shares) {
    share.feeUsdCents = payoutFeeCents(share.grossUsdCents)
    share.netUsdCents = share.grossUsdCents - share.feeUsdCents
  }

  const paid = new Map(shares.map((s) => [s.videoId, s]))
  return entries.map(
    (e) =>
      paid.get(e.videoId) ?? {
        ...e,
        shareBp: 0,
        grossUsdCents: 0,
        feeUsdCents: 0,
        netUsdCents: 0,
      },
  )
}
