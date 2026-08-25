import path from "node:path"
import { fileURLToPath } from "node:url"
import dotenv from "dotenv"
import Stripe from "stripe"

// Same pattern as packages/db: modules that read env load the repo-root .env themselves so
// they work outside Next.
const currentDir = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${currentDir}/../../../../.env`, quiet: true })

let client: Stripe | null = null

/** Null when Stripe is not configured, so donations degrade to "unavailable" rather than
 *  taking the whole API down at import time. */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return null
  client ??= new Stripe(key)
  return client
}

export function stripeWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET
}

/**
 * Donation amounts are chosen from a fixed set rather than accepted from the request.
 *
 * The checkout endpoint is unauthenticated so anyone can donate, which means an
 * attacker-controlled amount would let someone mint a Stripe session for any value they
 * liked and attach our branding to it.
 */
export const DONATION_PRESETS = {
  small: 500,
  medium: 2500,
  large: 10000,
} as const

export type DonationPreset = keyof typeof DONATION_PRESETS
