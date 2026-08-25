"use client"

import { Button } from "@ui/base/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ui/base/ui/dialog"
import { useCallback, useState } from "react"

/** GitHub covers the processing fees on Sponsors for personal accounts, so the whole amount
 *  arrives. Stripe's standard US card rate is 2.9% + 30c, which is most of the reason to show
 *  both: on a $25 donation that difference is about a dollar, and people should get to decide
 *  rather than have it decided for them. */
const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Andrew-Chen-Wang"

export function DonateButton() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const payWithStripe = useCallback(() => {
    const run = async () => {
      setPending(true)
      setError(null)
      try {
        // The amount is chosen server-side from a fixed set. This endpoint is
        // unauthenticated so anyone can donate, and an amount posted from here would let
        // anyone mint a Checkout session for any value with our branding on it.
        const response = await fetch("/api/v1/donation/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ preset: "medium" }),
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const { url } = (await response.json()) as { url: string }
        window.location.href = url
      } catch {
        setError("Could not start checkout. Please try again.")
        setPending(false)
      }
    }
    void run()
  }, [])

  return (
    <>
      {/* The dialog is already controlled, so the button just sets state -- no trigger
          wrapper, and no render-prop indirection to get wrong. */}
      <Button
        size="lg"
        variant="outline"
        onClick={() => {
          setOpen(true)
        }}
      >
        Fund the experiment
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fund the experiment</DialogTitle>
            <DialogDescription>
              Both work. They differ in how much of your money actually arrives.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <a
              href={GITHUB_SPONSORS_URL}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-1 rounded-lg border border-border p-4 transition-colors hover:bg-accent"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">GitHub Sponsors</span>
                <span className="text-sm font-medium text-green-600 dark:text-green-500">
                  No fee
                </span>
              </span>
              <span className="text-sm text-muted-foreground">
                GitHub covers the processing fees, so 100% of what you give arrives. Needs a GitHub
                account.
              </span>
            </a>

            <button
              type="button"
              onClick={payWithStripe}
              disabled={pending}
              className="flex flex-col gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:bg-accent disabled:opacity-60"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{pending ? "Redirecting…" : "Card, via Stripe"}</span>
                <span className="text-sm text-muted-foreground">2.9% + $0.30</span>
              </span>
              <span className="text-sm text-muted-foreground">
                Card, Apple Pay, Cash App or Klarna. No account needed. On $25, roughly $1.03 goes
                to Stripe.
              </span>
            </button>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <p className="text-xs text-muted-foreground">
              Either way the money funds inference and hosting for the agents building here, and
              shows up as a cost on the revenue page.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
