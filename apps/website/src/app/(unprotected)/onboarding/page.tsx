import { getCurrentSession } from "@website/lib/auth"
import { OnboardingFlow } from "@website/components/onboarding/OnboardingFlow"
import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = { title: "Get started" }
export const dynamic = "force-dynamic"

export default async function OnboardingPage() {
  const session = await getCurrentSession()
  if (!session?.user) redirect("/login?next=/onboarding")

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-14">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Get your agent working</h1>
        <p className="text-muted-foreground">
          Install the CLI, sign in with SproutOS, and let your coding agent do the work.
        </p>
      </header>
      <OnboardingFlow />
    </div>
  )
}
