import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@ui/base/ui/badge"
import { Button } from "@ui/base/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@ui/base/ui/card"
import { LoadingButton } from "@ui/base/ui/loading-button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import {
  MARKETING_POOL_PERCENT,
  PAYOUT_FEE_FLAT_CENTS,
  type PayoutInterval,
  formatMinorUnits,
} from "@utils/marketing"
import {
  getApiV1BillingPayoutAccountOptions,
  getApiV1BillingPayoutAccountQueryKey,
  getApiV1EarnEarningsMineOptions,
  getApiV1EarnEarningsMineQueryKey,
  postApiV1BillingPayoutAccountOnboardingLinkMutation,
  postApiV1BillingPayoutAccountPayoutMutation,
  postApiV1BillingPayoutAccountRefreshMutation,
  putApiV1BillingPayoutAccountScheduleMutation,
} from "@lib/api-client/generated/@tanstack/react-query.gen"
import { useEffect } from "react"
import { toast } from "sonner"

/** Links to pages Next.js serves, which this SPA's router does not know about. */
function nextUrl(path: string): string {
  return `${import.meta.env.VITE_NEXTJS_URL ?? ""}${path}`
}

export const Route = createFileRoute("/billing")({
  component: BillingPage,
})

/**
 * Surfaces the API's own sentence when it sent one.
 *
 * It matters most for the 503 this endpoint returns when Stripe Connect is not enabled on
 * the deployment, and for "your balance is below Stripe's minimum" -- "try again" would be
 * advice that never works.
 */
function apiMessage(error: unknown, fallback: string): string {
  return typeof error === "object" && error !== null && "error" in error
    ? ((error as { error?: { message?: string } }).error?.message ?? fallback)
    : fallback
}

function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
}

const SCHEDULES: { value: PayoutInterval; label: string; detail: string }[] = [
  { value: "daily", label: "Daily", detail: "Stripe pays out as soon as funds clear." },
  { value: "weekly", label: "Weekly", detail: "One payout a week." },
  { value: "monthly", label: "Monthly", detail: "One payout a month." },
  { value: "manual", label: "Manual", detail: "Nothing moves until you press the button." },
]

function BillingPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery(getApiV1BillingPayoutAccountOptions())
  const { data: earningsData } = useQuery(getApiV1EarnEarningsMineOptions())
  const account = data?.data
  const earnings = earningsData?.data

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getApiV1BillingPayoutAccountQueryKey() })
    void queryClient.invalidateQueries({ queryKey: getApiV1EarnEarningsMineQueryKey() })
  }

  const refresh = useMutation({
    ...postApiV1BillingPayoutAccountRefreshMutation(),
    onSuccess: invalidate,
    onError: (error) => {
      toast.error(apiMessage(error, "Could not read your account from Stripe."))
    },
  })

  const startOnboarding = useMutation({
    ...postApiV1BillingPayoutAccountOnboardingLinkMutation(),
    onSuccess: (result) => {
      // Stripe hosts the whole flow, so this leaves the SPA and comes back to /billing?return=1.
      window.location.href = result.url
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not start Stripe onboarding. Please try again."))
    },
  })

  const setSchedule = useMutation({
    ...putApiV1BillingPayoutAccountScheduleMutation(),
    onSuccess: () => {
      toast.success("Payout schedule updated.")
      invalidate()
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Could not change your payout schedule."))
    },
  })

  const payoutNow = useMutation({
    ...postApiV1BillingPayoutAccountPayoutMutation(),
    onSuccess: (result) => {
      toast.success(
        `Payout of ${formatMinorUnits(result.amountMinorUnits, result.currency)} is on its way.`,
      )
      invalidate()
    },
    onError: (error) => {
      toast.error(apiMessage(error, "Stripe refused the payout."))
    },
  })

  // Stripe sends people back here the moment they finish, usually before the account.updated
  // webhook lands. Pulling once on return is what stops the page telling somebody who just
  // connected that they have not connected.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has("return") || params.has("refresh")) {
      refresh.mutate({})
      window.history.replaceState({}, "", window.location.pathname)
    }
    // Deliberately once, on mount: this reacts to how the page was arrived at, not to state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const payoutsEnabled = account?.payoutsEnabled === true
  const started = account?.linked === true
  const currency = account?.currency ?? "usd"
  const available = account?.availableMinorUnits ?? 0
  const minimum = account?.minimumPayoutMinorUnits ?? 1
  const belowMinimum = available < minimum

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Billing and earnings</h1>
        <p className="text-muted-foreground">
          What you have earned promoting SproutBiz businesses, and where it goes. Every business
          sets aside {MARKETING_POOL_PERCENT}% of its monthly profit for the people who advertise it
          &mdash; see{" "}
          <a href={nextUrl("/earn")} className="underline">
            Earn Money
          </a>
          .
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Owed to you</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsdCents(earnings?.pendingUsdCents ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">
              Calculated, waiting on the next payout run
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">Paid to you</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatUsdCents(earnings?.paidUsdCents ?? 0)}
            </span>
            <span className="text-xs text-muted-foreground">Sent to your Stripe account</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1 p-5">
            <span className="text-sm text-muted-foreground">In your Stripe balance</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatMinorUnits(available, currency)}
            </span>
            <span className="text-xs text-muted-foreground">Ready to pay out to your bank</span>
          </CardContent>
        </Card>
      </div>

      {(earnings?.unsettledVideoCount ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          {earnings?.unsettledVideoCount} of your videos{" "}
          {earnings?.unsettledVideoCount === 1 ? "has" : "have"} a final view count but{" "}
          {earnings?.unsettledVideoCount === 1 ? "is" : "are"} in a month that has not been
          calculated yet, so {earnings?.unsettledVideoCount === 1 ? "it is" : "they are"} not
          counted above.
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Payout account</CardTitle>
          {isLoading ? null : payoutsEnabled ? (
            <Badge>Ready to be paid</Badge>
          ) : started ? (
            <Badge variant="secondary">Stripe still needs details</Badge>
          ) : (
            <Badge variant="outline">Not connected</Badge>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : payoutsEnabled ? (
            <p className="text-muted-foreground">
              Your Stripe account is connected and can receive payouts. Payouts appear publicly on
              the payouts page, like every other figure here.
            </p>
          ) : started ? (
            <p className="text-muted-foreground">
              You started onboarding but Stripe still wants something &mdash; usually an identity
              document or bank details. Until it is finished we cannot send you money, and a payout
              run will skip you rather than fail.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Stripe handles the whole thing: your bank details and identity documents go to Stripe,
              never to us. All we store is the account id it hands back.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <LoadingButton
              loading={startOnboarding.isPending}
              onClick={() => {
                startOnboarding.mutate({})
              }}
            >
              {started ? "Continue on Stripe" : "Link your Stripe account"}
            </LoadingButton>
            {started && (
              <LoadingButton
                variant="outline"
                loading={refresh.isPending}
                onClick={() => {
                  refresh.mutate({})
                }}
              >
                Check status
              </LoadingButton>
            )}
          </div>
        </CardContent>
      </Card>

      {payoutsEnabled && (
        <Card>
          <CardHeader>
            <CardTitle>Getting the money to your bank</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <p className="text-muted-foreground">
              We move your share into your Stripe balance. Getting it from there to your bank is
              your choice: let Stripe do it on a schedule, or press the button yourself.
            </p>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Schedule</span>
              <div className="flex flex-wrap gap-2">
                {SCHEDULES.map((schedule) => (
                  <Button
                    key={schedule.value}
                    size="sm"
                    variant={account?.payoutInterval === schedule.value ? "default" : "outline"}
                    disabled={setSchedule.isPending}
                    onClick={() => {
                      setSchedule.mutate({ body: { interval: schedule.value } })
                    }}
                  >
                    {schedule.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {SCHEDULES.find((s) => s.value === account?.payoutInterval)?.detail ??
                  "Pick how often Stripe should pay you out."}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Pay out now</span>
              <div className="flex flex-wrap items-center gap-3">
                <LoadingButton
                  loading={payoutNow.isPending}
                  disabled={belowMinimum}
                  onClick={() => {
                    payoutNow.mutate({})
                  }}
                >
                  Pay out {formatMinorUnits(available, currency)}
                </LoadingButton>
                {belowMinimum && (
                  <span className="text-sm text-muted-foreground">
                    Stripe will not pay out less than {formatMinorUnits(minimum, currency)} in{" "}
                    {currency.toUpperCase()}. Your balance stays put until it clears that.
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">What it costs</p>
              <p className="mt-1">
                The {MARKETING_POOL_PERCENT}% a business sets aside is inclusive of what Stripe
                charges to move the money, so the fee comes out of your share rather than out of the
                business. It is 0.25% of the payout plus {formatUsdCents(PAYOUT_FEE_FLAT_CENTS)},
                and it is shown on every line of your earnings below and on the public{" "}
                <a href={nextUrl("/payouts")} className="underline">
                  payouts page
                </a>
                .
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your earnings</CardTitle>
        </CardHeader>
        <CardContent>
          {(earnings?.byMonth.length ?? 0) === 0 ? (
            <p className="text-muted-foreground">
              Nothing calculated yet. Submit a video on{" "}
              <a href={nextUrl("/earn")} className="underline">
                Earn Money
              </a>{" "}
              and it will appear here once its month is worked out.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead className="text-right">Share</TableHead>
                    <TableHead className="text-right">Stripe fee</TableHead>
                    <TableHead className="text-right">You get</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earnings?.byMonth.map((row) => (
                    <TableRow key={`${row.month}-${row.businessName}`}>
                      <TableCell>{row.month.slice(0, 7)}</TableCell>
                      <TableCell>{row.businessName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsdCents(row.grossUsdCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsdCents(row.feeUsdCents)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatUsdCents(row.netUsdCents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.status === "paid" ? "default" : "secondary"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
