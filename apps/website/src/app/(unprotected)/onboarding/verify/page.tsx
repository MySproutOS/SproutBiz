import { fetchUserOnboarding } from "@lib/dao/userOnboarding/fetch"
import { db } from "@template-nextjs/db"
import { Card, CardContent } from "@ui/base/ui/card"
import { getCurrentSession } from "@website/lib/auth"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Verify your agent" }

// Never cache: the nonce is per-user and short-lived.
export const dynamic = "force-dynamic"

/**
 * Renders the browser-check nonce.
 *
 * This is the load-bearing page of the whole check: the nonce exists *only* in this HTML,
 * and this HTML is only served to a signed-in session. An agent that can read it has
 * demonstrably driven a real, logged-in browser rather than just holding an API token.
 */
export default async function OnboardingVerifyPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect("/login?next=/onboarding/verify")

  const row = await fetchUserOnboarding(db).getOne(session.user.id)
  const nonce = row?.verificationNonce ?? null

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Verify your agent</h1>

      {nonce ? (
        <>
          <p className="text-muted-foreground">
            Tell your agent to read the code below and POST it to{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
              /api/v1/onboarding/verify/complete
            </code>{" "}
            using its own token.
          </p>
          <Card>
            <CardContent className="p-6">
              <code
                data-onboarding-nonce
                className="block break-all font-mono text-lg tracking-wider"
              >
                {nonce}
              </code>
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">
            This code expires in 15 minutes and can only be used once. It proves your agent can
            drive a signed-in browser, which is the one thing the API alone cannot show.
          </p>
        </>
      ) : (
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              No verification is in progress. Start one from the onboarding page and this code will
              appear here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
