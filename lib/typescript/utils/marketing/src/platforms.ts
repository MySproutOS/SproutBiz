/**
 * The Earn Money program's rules, in one place.
 *
 * Everything here is pure -- no database, no environment -- so the API, the server-rendered
 * website and both SPAs can share a single definition of what counts. Two numbers in this
 * file decide how real money is split, so they are deliberately not duplicated anywhere else.
 */

/** A video shorter than this is not an advert, it is a glance. */
export const MIN_DURATION_SECONDS = 20

/** Views stop counting this long after the video was created. */
export const MEASUREMENT_WINDOW_DAYS = 30

/** The share of a business's profit that funds the pool, before Stripe takes its cut. */
export const MARKETING_POOL_PERCENT = 20

export type MarketingPlatform = "youtube_short" | "tiktok" | "instagram_reel" | "instagram_post"

export type PlatformRules = {
  readonly label: string
  /**
   * Raw views are divided by this before they count towards a share.
   *
   * TikTok's divisor is 3 because a TikTok "view" is counted on impression -- the video
   * starts playing as you scroll past it -- while YouTube and Instagram require a longer
   * watch. Paying the same rate for both would route the whole pool to TikTok regardless of
   * which advert actually worked.
   */
  readonly divisor: number
  /** Below this many RAW views the video earns nothing at all. */
  readonly minViews: number
}

export const PLATFORMS: Readonly<Record<MarketingPlatform, PlatformRules>> = {
  youtube_short: { label: "YouTube Short", divisor: 1, minViews: 2_000 },
  tiktok: { label: "TikTok", divisor: 3, minViews: 4_500 },
  instagram_reel: { label: "Instagram Reel", divisor: 1, minViews: 2_000 },
  instagram_post: { label: "Instagram Post", divisor: 1, minViews: 2_000 },
} as const

export const MARKETING_PLATFORMS = Object.keys(PLATFORMS) as MarketingPlatform[]

export function isMarketingPlatform(value: string): value is MarketingPlatform {
  return Object.hasOwn(PLATFORMS, value)
}

export function platformLabel(platform: string): string {
  return isMarketingPlatform(platform) ? PLATFORMS[platform].label : platform
}

/** Raw views converted into the units a payout share is computed in. */
export function weightedViews(platform: MarketingPlatform, views: number): number {
  return Math.floor(views / PLATFORMS[platform].divisor)
}

/**
 * The view floor is checked against RAW views, not weighted ones.
 *
 * That matters on TikTok: the bar is 4,500 actual views, not 4,500 after the division.
 */
export function meetsViewMinimum(platform: MarketingPlatform, views: number): boolean {
  return views >= PLATFORMS[platform].minViews
}

/** When a video's 30-day counting window closes, given when it was created. */
export function measurementDeadline(postedAt: Date): Date {
  const deadline = new Date(postedAt.getTime())
  deadline.setUTCDate(deadline.getUTCDate() + MEASUREMENT_WINDOW_DAYS)
  return deadline
}
