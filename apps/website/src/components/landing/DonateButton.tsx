"use client"

import { Button } from "@ui/base/ui/button"
import { useCallback, useState } from "react"

/**
 * Starts a Stripe Checkout session and hands the browser to Stripe.
 *
 * The amount is decided server-side from a fixed set rather than being posted from here,
 * so the page cannot be used to create a session for an arbitrary amount.
 */
export function DonateButton() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const donate = useCallback(() => {
    const run = async () => {
      setPending(true)
      setError(null)
      try {
        const response = await fetch("/api/v1/donation/checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: window.location.origin },
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
    <div className="flex flex-col gap-2">
      <Button onClick={donate} disabled={pending} size="lg">
        {pending ? "Redirecting…" : "Fund the experiment"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
