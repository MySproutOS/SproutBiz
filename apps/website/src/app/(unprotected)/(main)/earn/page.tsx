import { fetchBusiness } from "@lib/dao/business/fetch"
import { fetchMarketingPayout } from "@lib/dao/marketingPayout/fetch"
import { fetchMarketingVideo } from "@lib/dao/marketingVideo/fetch"
import { db } from "@template-nextjs/db"
import { Badge } from "@ui/base/ui/badge"
import { buttonVariants } from "@ui/base/ui/button"
import { Card, CardContent } from "@ui/base/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import {
  MARKETING_POOL_PERCENT,
  MEASUREMENT_WINDOW_DAYS,
  MIN_DURATION_SECONDS,
  PLATFORMS,
} from "@utils/marketing"
import { BusinessSearch } from "@website/components/business/BusinessSearch"
import { SubmitVideoForm } from "@website/components/business/SubmitVideoForm"
import { formatUsdCents } from "@website/components/landing/money"
import { getCurrentSession } from "@website/lib/auth"
import type { Metadata } from "next"
import Link from "next/link"

// Reads the database, like /revenue. Prerendering it would make the Docker build depend on a
// live database and would serve stale pool figures for nothing.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Earn Money",
  description: `Make a short video advertising a SproutBiz business and take a share of ${MARKETING_POOL_PERCENT}% of its profit.`,
}

export default async function EarnPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const [session, businesses, totalPaidUsdCents] = await Promise.all([
    getCurrentSession(),
    fetchBusiness(db).listWithTotals(100, q),
    fetchMarketingPayout(db).totalPaidUsdCents(),
  ])
  const counts = await fetchMarketingVideo(db).countsByBusiness(businesses.map((b) => b.id))

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Earn Money</h1>
        <p className="max-w-3xl text-lg">
          Every business here sets aside{" "}
          <strong className="font-semibold">{MARKETING_POOL_PERCENT}% of its profit</strong> each
          month to pay the people who advertise it. Make a short video about one of them, post it,
          and take a share of that month&apos;s pool in proportion to the views you brought in.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/payouts" className={buttonVariants({ variant: "outline" })}>
            See who has been paid ({formatUsdCents(totalPaidUsdCents)} so far)
          </Link>
          {session !== null && (
            <Link href="/billing" className={buttonVariants({ variant: "outline" })}>
              Set up your payouts
            </Link>
          )}
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">How the split works</h2>
        <p className="max-w-3xl text-muted-foreground">
          At the end of each month we add up the weighted views of every video for a business. Your
          share of the pool is your weighted views divided by that total. Views stop counting{" "}
          <strong className="text-foreground">
            {MEASUREMENT_WINDOW_DAYS} days after the video was created
          </strong>
          , so a video posted on 20 January finishes counting on 19 February and is paid in the
          February run.
        </p>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Views counted as</TableHead>
                <TableHead className="text-right">Minimum to earn</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(PLATFORMS).map(([key, rules]) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">{rules.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rules.divisor === 1 ? "1 view = 1" : `views ÷ ${rules.divisor}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {rules.minViews.toLocaleString("en-US")} views
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          TikTok counts a view the moment the video appears on screen, while YouTube and Instagram
          want a longer watch. Dividing TikTok views by three is what stops the whole pool going to
          one platform regardless of which advert actually worked.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">The rules, in full</h2>
        <ul className="flex max-w-3xl list-disc flex-col gap-2 pl-5 text-muted-foreground">
          <li>
            The video must be at least{" "}
            <strong className="text-foreground">{MIN_DURATION_SECONDS} seconds</strong> long and
            must be a proper advert that showcases the business.{" "}
            <strong className="text-foreground">We decide whether it does.</strong> A clip that
            mentions the product in passing does not qualify, and we will say why if we reject it.
          </li>
          <li>
            YouTube Shorts, TikTok videos, and Instagram Reels and posts only. TikTok slideshows are
            not videos and are not accepted.
          </li>
          <li>
            A video can only be claimed once, across every business.{" "}
            <strong className="text-foreground">
              The first person to submit it earns the money.
            </strong>{" "}
            We do not check who uploaded it &mdash; we have no way to, until TikTok grants us
            developer access &mdash; so submit your own work promptly.
          </li>
          <li>
            Below the minimum view count for your platform, a video earns nothing. It is not
            pro-rated down to a few cents; it simply does not enter the split.
          </li>
          <li>
            Payouts go out at the end of the month through Stripe. The {MARKETING_POOL_PERCENT}%
            includes what Stripe charges to move the money, so what reaches you is a little under
            your raw percentage of the pool.
          </li>
          <li>
            Bought views, engagement pods, comment spam and fake accounts disqualify a video and,
            repeated, disqualify you. This is a real advertising budget, not a bounty on numbers.
          </li>
          <li>
            A business that made no profit that month funds no pool. We will not pay a marketing
            budget out of a loss.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Submit a video</h2>
        {session === null ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="text-muted-foreground">
                You need an account to claim a video, and a Stripe payout account to be paid.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login" className={buttonVariants()}>
                  Log in to submit
                </Link>
                <Link href="/onboarding" className={buttonVariants({ variant: "outline" })}>
                  Create an account
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <SubmitVideoForm
                businesses={businesses.map((business) => ({
                  id: business.id,
                  name: business.name,
                }))}
              />
              <p className="mt-4 text-sm text-muted-foreground">
                Before your first payout, link a Stripe account on{" "}
                <Link href="/billing" className="underline">
                  billing
                </Link>
                . You can submit without one, but we cannot send you money until it is connected.
              </p>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Businesses to promote</h2>
          <BusinessSearch placeholder="Search businesses" />
        </div>

        {businesses.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-8">
              <h3 className="text-lg font-medium">
                {q ? `Nothing matches "${q}"` : "No businesses yet"}
              </h3>
              <p className="text-muted-foreground">
                {q
                  ? "No business has that name or tagline. Try a shorter search."
                  : "Nothing has launched yet. Once a business is registered it appears here."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business</TableHead>
                  <TableHead className="text-right">Net profit</TableHead>
                  <TableHead className="text-right">Pool at {MARKETING_POOL_PERCENT}%</TableHead>
                  <TableHead className="text-right">Videos</TableHead>
                  <TableHead className="text-right">Paid out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {businesses.map((business) => {
                  // Shown as an indication of the size of the prize, not a promise: the pool
                  // that actually pays is set by hand each month against that month's figures.
                  const indicativePool = Math.max(
                    0,
                    Math.floor((business.netUsdCents * MARKETING_POOL_PERCENT) / 100),
                  )
                  const stats = counts.get(business.id)
                  return (
                    <TableRow key={business.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-2 font-medium">
                            {business.url ? (
                              <a
                                href={business.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline-offset-4 hover:underline"
                              >
                                {business.name}
                              </a>
                            ) : (
                              business.name
                            )}
                            {business.status !== "active" && (
                              <Badge variant="secondary">{business.status}</Badge>
                            )}
                          </span>
                          {business.tagline && (
                            <span className="text-sm text-muted-foreground">
                              {business.tagline}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsdCents(business.netUsdCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {indicativePool === 0 ? (
                          <span className="text-muted-foreground">&mdash;</span>
                        ) : (
                          formatUsdCents(indicativePool)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {stats?.videoCount ?? 0}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsdCents(stats?.paidOutUsdCents ?? 0)}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          The pool column is lifetime net profit at {MARKETING_POOL_PERCENT}%, shown to give a sense
          of scale. What actually pays is set each month against that month&apos;s figures, and
          published on{" "}
          <Link href="/payouts" className="underline">
            payouts
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
