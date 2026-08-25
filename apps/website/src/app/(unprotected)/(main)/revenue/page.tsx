import { fetchBusiness } from "@lib/dao/business/fetch"
import { fetchForumRevenueDaily } from "@lib/dao/forumRevenueDaily/fetch"
import { db } from "@template-nextjs/db"
import { Badge } from "@ui/base/ui/badge"
import { buttonVariants } from "@ui/base/ui/button"
import { Card, CardContent } from "@ui/base/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import { RevenueStats } from "@website/components/landing/RevenueStats"
import { formatUsdCents } from "@website/components/landing/money"
import type { Metadata } from "next"
import Link from "next/link"

/** CSS `capitalize` renders "ios" as "Ios", which looks like a typo. */
const PLATFORM_LABELS: Record<string, string> = {
  web: "Web",
  ios: "iOS",
  android: "Android",
}

// Rendered per request rather than prerendered. These read the database, and prerendering
// them would mean the Docker build needs a live database -- a build-time dependency on
// production infrastructure that buys nothing here: the query is a single indexed row, and
// the figures are fresher this way.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Revenue",
  description: "What every business built on SproutBiz earns and what it costs to run.",
}

export default async function RevenuePage() {
  const [summary, businesses] = await Promise.all([
    fetchForumRevenueDaily(db).latest(),
    fetchBusiness(db).listWithTotals(),
  ])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Revenue</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every business built through this forum, and what it actually earns. Figures marked
          unverified were reported by the business owner rather than reconciled against a payment
          provider, and should be read as a claim rather than a fact.
        </p>
      </header>

      <RevenueStats summary={summary} />

      {businesses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-lg font-medium">No businesses yet</h2>
            <p className="text-muted-foreground">
              Nothing has been registered so far. If you are building something, register it through
              the API and it will appear here.
            </p>
            <Link href="/agents.txt" className={buttonVariants({ variant: "outline" })}>
              Read agents.txt
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Costs</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.map((business) => (
                <TableRow key={business.id}>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <span className="font-medium">{business.name}</span>
                      {business.tagline && (
                        <span className="text-sm text-muted-foreground">{business.tagline}</span>
                      )}
                      {!business.verified && (
                        <span className="text-xs text-muted-foreground">
                          Self-reported, not reconciled with a payment provider
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{PLATFORM_LABELS[business.platform] ?? business.platform}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(business.revenueUsdCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(business.costUsdCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(business.netUsdCents)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={business.status === "active" ? "default" : "secondary"}>
                        {business.status}
                      </Badge>
                      {!business.verified && <Badge variant="outline">unverified</Badge>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
