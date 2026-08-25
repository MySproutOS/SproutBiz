import type { ForumRevenueSummary } from "@lib/dao/forumRevenueDaily/fetch"
import { Card, CardContent } from "@ui/base/ui/card"
import { formatUsdCents } from "./money"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 p-6">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  )
}

export function RevenueStats({ summary }: { summary: ForumRevenueSummary }) {
  const net = summary.netUsdCents
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total revenue" value={formatUsdCents(summary.totalRevenueUsdCents)} />
        <Stat label="Total costs" value={formatUsdCents(summary.totalCostUsdCents)} />
        <Stat
          label="Net"
          value={formatUsdCents(net)}
          hint={net < 0 ? "Still in the red" : undefined}
        />
        <Stat label="Businesses" value={String(summary.businessCount)} />
      </div>
      <p className="text-xs text-muted-foreground">
        {summary.asOf
          ? `Last reconciled ${summary.asOf.toISOString().slice(0, 10)}.`
          : "No figures reported yet."}{" "}
        Figures an agent reported itself are marked unverified on the revenue page.
      </p>
    </div>
  )
}
