import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@ui/base/ui/badge"
import { Button } from "@ui/base/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@ui/base/ui/card"
import { Input } from "@ui/base/ui/input"
import { Label } from "@ui/base/ui/label"
import { LoadingButton } from "@ui/base/ui/loading-button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import {
  getApiAdminMarketingPoolsByIdPayoutsOptions,
  getApiAdminMarketingPoolsByIdPayoutsQueryKey,
  getApiAdminMarketingPoolsOptions,
  getApiAdminMarketingPoolsQueryKey,
  postApiAdminMarketingPoolsByIdCalculateMutation,
  postApiAdminMarketingPoolsByIdPayMutation,
  putApiAdminMarketingPoolsMutation,
} from "@frontends/admin/lib/adminApi"
import { useState } from "react"
import { toast } from "sonner"

/** Surfaces the API's own sentence when it sent one -- those are written to be read. */
function onError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "error" in error
      ? ((error as { error?: { message?: string } }).error?.message ?? "Request failed")
      : "Request failed"
  toast.error(message)
}

export const Route = createFileRoute("/payouts")({
  component: PayoutsPage,
})

function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
}

/** The month we pay at the end of: the previous one, in UTC. */
function defaultMonth(): string {
  const now = new Date()
  const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, "0")}`
}

function PayoutsPage() {
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(defaultMonth())
  const [openBusinessId, setOpenBusinessId] = useState<string | null>(null)
  const [poolDollars, setPoolDollars] = useState("")

  const { data, isLoading } = useQuery(getApiAdminMarketingPoolsOptions({ query: { month } }))
  const pools = data?.data ?? []
  const open = pools.find((pool) => pool.businessId === openBusinessId)

  const { data: payoutData } = useQuery({
    ...getApiAdminMarketingPoolsByIdPayoutsOptions({ path: { id: open?.poolId ?? "" } }),
    enabled: Boolean(open?.poolId),
  })

  function invalidate() {
    void queryClient.invalidateQueries({
      queryKey: getApiAdminMarketingPoolsQueryKey({ query: { month } }),
    })
    void queryClient.invalidateQueries({
      queryKey: getApiAdminMarketingPoolsByIdPayoutsQueryKey({ path: { id: open?.poolId ?? "" } }),
    })
  }

  const setPool = useMutation({
    ...putApiAdminMarketingPoolsMutation(),
    onSuccess: () => {
      toast.success("Pool saved.")
      invalidate()
    },
    onError,
  })

  const calculate = useMutation({
    ...postApiAdminMarketingPoolsByIdCalculateMutation(),
    onSuccess: () => {
      toast.success("Split calculated. Check it before paying.")
      invalidate()
    },
    onError,
  })

  const pay = useMutation({
    ...postApiAdminMarketingPoolsByIdPayMutation(),
    onSuccess: () => {
      toast.success("Payouts sent.")
      invalidate()
    },
    onError,
  })

  const payouts = payoutData?.data ?? []
  const payoutTotal = payouts.reduce((sum, payout) => sum + payout.netUsdCents, 0)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Marketing payouts</h1>
        <p className="text-muted-foreground">
          Set each business&apos;s pool for the month, calculate the split, then pay. A video
          belongs to the month its 30-day window closed in, which is why late January videos land in
          February.
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="month">Month</Label>
          <Input
            id="month"
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value)
              setOpenBusinessId(null)
            }}
            className="w-48"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : pools.length === 0 ? (
        <p className="text-muted-foreground">No businesses registered yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Costs</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">20% suggestion</TableHead>
                <TableHead className="text-right">Pool</TableHead>
                <TableHead className="text-right">Eligible</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.map((pool) => (
                <TableRow key={pool.businessId}>
                  <TableCell className="font-medium">{pool.businessName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(pool.revenueUsdCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(pool.costUsdCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={pool.netUsdCents <= 0 ? "text-destructive" : undefined}>
                      {formatUsdCents(pool.netUsdCents)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(pool.suggestedUsdCents)}
                    {pool.netUsdCents <= 0 && (
                      <div className="text-xs text-destructive">no profit to share</div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatUsdCents(pool.poolUsdCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pool.eligibleVideoCount}
                    <div className="text-xs text-muted-foreground">
                      {pool.totalWeightedViews.toLocaleString()} weighted
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pool.status === "paid" ? "default" : "secondary"}>
                      {pool.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant={openBusinessId === pool.businessId ? "default" : "outline"}
                        onClick={() => {
                          setOpenBusinessId(pool.businessId)
                          setPoolDollars(
                            ((pool.poolUsdCents || pool.suggestedUsdCents) / 100).toFixed(2),
                          )
                        }}
                      >
                        Manage
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {open && (
        <Card>
          <CardHeader>
            <CardTitle>
              {open.businessName} — {month}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="pool-dollars">Pool in dollars</Label>
                <Input
                  id="pool-dollars"
                  type="number"
                  min={0}
                  step="0.01"
                  value={poolDollars}
                  onChange={(event) => {
                    setPoolDollars(event.target.value)
                  }}
                  className="w-40"
                  disabled={open.status === "paid"}
                />
              </div>
              <LoadingButton
                loading={setPool.isPending}
                disabled={open.status === "paid"}
                onClick={() => {
                  setPool.mutate({
                    body: {
                      businessId: open.businessId,
                      month,
                      poolUsdCents: Math.round(Number(poolDollars) * 100),
                    },
                  })
                }}
              >
                Save pool
              </LoadingButton>
              <LoadingButton
                variant="outline"
                loading={calculate.isPending}
                disabled={open.poolId === null || open.status === "paid"}
                onClick={() => {
                  if (open.poolId === null) return
                  calculate.mutate({ path: { id: open.poolId } })
                }}
              >
                Calculate split
              </LoadingButton>
              <LoadingButton
                loading={pay.isPending}
                disabled={open.poolId === null || payouts.length === 0 || open.status === "paid"}
                onClick={() => {
                  if (open.poolId === null) return
                  pay.mutate({ path: { id: open.poolId } })
                }}
              >
                Pay {formatUsdCents(payoutTotal)}
              </LoadingButton>
            </div>

            {open.netUsdCents <= 0 && (
              <p className="text-sm text-destructive">
                This business has not made a profit. Paying a pool here spends Andrew&apos;s money
                rather than the business&apos;s.
              </p>
            )}

            {payouts.length === 0 ? (
              <p className="text-muted-foreground">
                Nothing calculated yet. Save a pool, then calculate the split.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Creator</TableHead>
                      <TableHead>Video</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Weighted</TableHead>
                      <TableHead className="text-right">Share</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((payout) => (
                      <TableRow key={payout.id}>
                        <TableCell>
                          {payout.username}
                          {!payout.payable && (
                            <div className="text-xs text-destructive">no Stripe account</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <a
                            href={payout.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline-offset-4 hover:underline"
                          >
                            {payout.platform}
                          </a>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {payout.viewCount === null ? "—" : payout.viewCount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {payout.weightedViews.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(payout.shareBp / 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsdCents(payout.grossUsdCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsdCents(payout.feeUsdCents)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatUsdCents(payout.netUsdCents)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant={payout.status === "paid" ? "default" : "secondary"}>
                              {payout.status}
                            </Badge>
                            {payout.failureReason && (
                              <span className="text-xs text-muted-foreground">
                                {payout.failureReason}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
