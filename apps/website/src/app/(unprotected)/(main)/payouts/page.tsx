import { fetchMarketingPayout } from "@lib/dao/marketingPayout/fetch"
import { db } from "@template-nextjs/db"
import { buttonVariants } from "@ui/base/ui/button"
import { Card, CardContent } from "@ui/base/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import { MARKETING_POOL_PERCENT, platformLabel } from "@utils/marketing"
import { formatUsdCents } from "@website/components/landing/money"
import type { Metadata } from "next"
import Link from "next/link"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Payouts",
  description: "Every video we have paid for advertising a SproutBiz business, and how much.",
}

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
})

/** "2026-08-01" -> "August 2026". Parsed as UTC so the label cannot slip a month. */
function monthLabel(month: string): string {
  return MONTH_FORMAT.format(new Date(`${month}T00:00:00Z`))
}

export default async function PayoutsPage() {
  const [payouts, totalPaidUsdCents] = await Promise.all([
    fetchMarketingPayout(db).listPaid(),
    fetchMarketingPayout(db).totalPaidUsdCents(),
  ])

  // Grouped by month so the page reads as a series of payout runs rather than one long list.
  const byMonth = new Map<string, typeof payouts>()
  for (const payout of payouts) {
    const key = monthLabel(payout.month)
    const existing = byMonth.get(key)
    if (existing) {
      existing.push(payout)
    } else {
      byMonth.set(key, [payout])
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Payouts</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every video we have paid for, and what it earned. Published in full for the same reason
          the revenue figures are: a marketing programme nobody can check is a marketing programme
          nobody should trust. Amounts are what actually left our Stripe account, after its fee.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-2xl font-semibold tabular-nums">
            {formatUsdCents(totalPaidUsdCents)}
          </span>
          <span className="text-muted-foreground">paid to creators so far</span>
        </div>
        <div>
          <Link href="/earn" className={buttonVariants({ variant: "outline" })}>
            How to earn this
          </Link>
        </div>
      </header>

      {payouts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-lg font-medium">Nothing has been paid out yet</h2>
            <p className="max-w-2xl text-muted-foreground">
              No payout run has happened so far. Every business sets aside {MARKETING_POOL_PERCENT}%
              of its profit for this, so the first run happens once a business turns a profit and
              someone has posted a qualifying video.
            </p>
            <Link href="/earn" className={buttonVariants()}>
              Submit a video
            </Link>
          </CardContent>
        </Card>
      ) : (
        [...byMonth.entries()].map(([month, rows]) => (
          <section key={month} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold">{month}</h2>
              <span className="text-muted-foreground tabular-nums">
                {formatUsdCents(rows.reduce((sum, row) => sum + row.netUsdCents, 0))} across{" "}
                {rows.length} {rows.length === 1 ? "video" : "videos"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Creator</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Video</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                    <TableHead className="text-right">Weighted</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/user/${row.username}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {row.username}
                        </Link>
                      </TableCell>
                      <TableCell>{row.businessName}</TableCell>
                      <TableCell>
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline-offset-4 hover:underline"
                        >
                          {platformLabel(row.platform)}
                        </a>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.viewCount === null ? "—" : row.viewCount.toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.weightedViews.toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(row.shareBp / 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsdCents(row.netUsdCents)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        ))
      )}
    </div>
  )
}
