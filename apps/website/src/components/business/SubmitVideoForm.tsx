"use client"

import { Button } from "@ui/base/ui/button"
import { Input } from "@ui/base/ui/input"
import { Checkbox } from "@ui/base/ui/checkbox"
import { Label } from "@ui/base/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@ui/base/ui/select"
import { MARKETING_POOL_PERCENT, MEASUREMENT_WINDOW_DAYS } from "@utils/marketing"
import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

export type SubmittableBusiness = { id: string; name: string }

type ErrorBody = { error?: { message?: string } }

/**
 * Claims a video for a business.
 *
 * The link is parsed server-side, so this form deliberately does not try to work out the
 * platform itself: two implementations of "is this a Short?" would drift, and the one that
 * decides whether a submission is accepted is the one on the server.
 */
export function SubmitVideoForm({ businesses }: { businesses: SubmittableBusiness[] }) {
  const router = useRouter()
  const [businessId, setBusinessId] = useState(businesses[0]?.id ?? "")
  const [url, setUrl] = useState("")
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const submit = useCallback(() => {
    const run = async () => {
      setPending(true)
      setError(null)
      setDone(false)
      try {
        const response = await fetch("/api/v1/earn/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ businessId, url }),
        })
        if (!response.ok) {
          // The API's rejection sentences are written to be shown to the submitter --
          // which link shape to paste, or that someone claimed the video first.
          const body = (await response.json().catch(() => ({}))) as ErrorBody
          setError(body.error?.message ?? `Something went wrong (HTTP ${response.status}).`)
          return
        }
        setUrl("")
        setDone(true)
        router.refresh()
      } catch {
        setError("Could not reach the server. Please try again.")
      } finally {
        setPending(false)
      }
    }
    void run()
  }, [businessId, url, router])

  if (businesses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        There are no businesses to promote yet. Check back once one has launched.
      </p>
    )
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="earn-business">Business</Label>
        <Select
          value={businessId}
          onValueChange={(value) => {
            setBusinessId(value ?? "")
          }}
        >
          <SelectTrigger id="earn-business" className="w-full sm:max-w-sm">
            {/* Base UI renders the raw value without a formatter, and the value is a uuid. */}
            <SelectValue placeholder="Pick a business">
              {(value: string | null) =>
                businesses.find((business) => business.id === value)?.name ?? "Pick a business"
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {businesses.map((business) => (
              <SelectItem key={business.id} value={business.id}>
                {business.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="earn-url">Video link</Label>
        <Input
          id="earn-url"
          type="url"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value)
          }}
          placeholder="https://www.youtube.com/shorts/..."
          required
        />
        <p className="text-xs text-muted-foreground">
          A YouTube Short, a TikTok video, or an Instagram Reel or post. Paste the full link — share
          shorteners like vm.tiktok.com are not accepted.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-border p-4">
        <Checkbox
          id="earn-terms"
          checked={acceptedTerms}
          onCheckedChange={(checked) => {
            setAcceptedTerms(checked)
          }}
          className="mt-0.5"
        />
        <Label htmlFor="earn-terms" className="block text-sm font-normal leading-relaxed">
          I have read and agree to the{" "}
          <a
            href="/legal/community-terms#earning-money"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Earn Money terms
          </a>
          : {MARKETING_POOL_PERCENT}% of a business&apos;s monthly profit is split by weighted
          views, views stop counting after {MEASUREMENT_WINDOW_DAYS} days, and payout runs are done
          by hand at month end so they can be a few days late.
        </Label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && (
        <p className="text-sm text-green-600 dark:text-green-500">
          Submitted. We will review it and, once approved, start counting views for 30 days.
        </p>
      )}

      <div>
        <Button type="submit" disabled={pending || url.trim() === "" || !acceptedTerms}>
          {pending ? "Submitting…" : "Submit video"}
        </Button>
      </div>
    </form>
  )
}
