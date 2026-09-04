import {
  getApiAdminContributionsOptions,
  getApiAdminContributionsQueryKey,
  postApiAdminContributionsCodeMonthsByIdFinalizeMutation,
  postApiAdminContributionsCodeMonthsByIdRejectMutation,
  postApiAdminContributionsSubmissionsByIdAcceptIdeaMutation,
  postApiAdminContributionsSubmissionsByIdAcceptMutation,
  postApiAdminContributionsSubmissionsByIdRejectMutation,
} from "@frontends/admin/lib/adminApi"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@ui/base/ui/badge"
import { Button } from "@ui/base/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import { toast } from "sonner"

export const Route = createFileRoute("/contributions")({
  component: ContributionsPage,
})

function onError(error: unknown) {
  const message =
    typeof error === "object" && error !== null && "error" in error
      ? ((error as { error?: { message?: string } }).error?.message ?? "Request failed")
      : "Request failed"
  toast.error(message)
}

function ask(label: string, initial = ""): string | null {
  const value = window.prompt(label, initial)
  return value === null ? null : value.trim()
}

function ContributionsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery(getApiAdminContributionsOptions())
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getApiAdminContributionsQueryKey() })

  const accepted = () => {
    toast.success("Contribution accepted and credits recorded.")
    void refresh()
  }
  const rejected = () => {
    toast.success("Contribution rejected.")
    void refresh()
  }
  const acceptIdea = useMutation({
    ...postApiAdminContributionsSubmissionsByIdAcceptIdeaMutation(),
    onSuccess: () => {
      toast.success("Idea accepted. Repository and SproutOS provisioning are queued.")
      void refresh()
    },
    onError,
  })
  const acceptSubmission = useMutation({
    ...postApiAdminContributionsSubmissionsByIdAcceptMutation(),
    onSuccess: accepted,
    onError,
  })
  const rejectSubmission = useMutation({
    ...postApiAdminContributionsSubmissionsByIdRejectMutation(),
    onSuccess: rejected,
    onError,
  })
  const finalizeMonth = useMutation({
    ...postApiAdminContributionsCodeMonthsByIdFinalizeMutation(),
    onSuccess: accepted,
    onError,
  })
  const rejectMonth = useMutation({
    ...postApiAdminContributionsCodeMonthsByIdRejectMutation(),
    onSuccess: rejected,
    onError,
  })

  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Contribution review</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only an administrator can award credits. Accepting an idea performs the business,
          community, ten-credit award, repository, and deployment workflow as one operation.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ideas and feedback</h2>
        {data.submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing awaiting review.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead>Business / post</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.submissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell>
                      <Badge>{submission.type}</Badge>
                    </TableCell>
                    <TableCell>u/{submission.username}</TableCell>
                    <TableCell className="text-xs">
                      {submission.businessName ?? submission.businessId ?? "New business"}
                      {submission.postId ? (
                        <div>
                          <a
                            className="underline underline-offset-2"
                            href={`/posting/${submission.postId}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open forum post
                          </a>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      {submission.feedbackEvidence ? (
                        <div className="mb-3 rounded border p-2 text-xs">
                          <p className="mb-1 font-medium">
                            Validates feedback from u/{submission.feedbackSubmittedBy ?? "unknown"}
                          </p>
                          <pre className="max-w-md whitespace-pre-wrap">
                            {JSON.stringify(submission.feedbackEvidence, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      <pre className="max-w-md whitespace-pre-wrap text-xs">
                        {JSON.stringify(submission.evidence, null, 2)}
                      </pre>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={acceptIdea.isPending || acceptSubmission.isPending}
                          onClick={() => {
                            if (submission.type === "idea") {
                              const name = ask("Business name")
                              if (!name) return
                              const suggestedSlug = name
                                .toLowerCase()
                                .replace(/[^a-z0-9]+/g, "-")
                                .replace(/^-|-$/g, "")
                              const slug = ask("Business URL slug", suggestedSlug)
                              if (!slug) return
                              const suggestedCommunity = slug.replace(/-/g, "_").slice(0, 21)
                              const communityName = ask(
                                "Subreddit name (3–21 letters, numbers, underscores)",
                                suggestedCommunity,
                              )
                              if (!communityName) return
                              const repositoryName = ask("GitHub repository name", slug)
                              if (!repositoryName) return
                              acceptIdea.mutate({
                                path: { id: submission.id },
                                body: {
                                  name,
                                  slug,
                                  communityName,
                                  repositoryName,
                                  platform: "web",
                                },
                              })
                              return
                            }
                            const fixed = submission.type === "validation" ? 1 : 3
                            const points = Number(ask("Contribution credits", String(fixed)))
                            const reason = ask("Reason for award")
                            if (!reason || !Number.isInteger(points)) return
                            acceptSubmission.mutate({
                              path: { id: submission.id },
                              body: { points, reason },
                            })
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rejectSubmission.isPending}
                          onClick={() => {
                            const reason = ask("Reason for rejection")
                            if (!reason) return
                            rejectSubmission.mutate({
                              path: { id: submission.id },
                              body: { reason },
                            })
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Monthly code contributions</h2>
        {data.codeMonths.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed month awaits review.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Pull requests</TableHead>
                  <TableHead>Change</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.codeMonths.map((month) => (
                  <TableRow key={month.id}>
                    <TableCell>{month.periodStart}</TableCell>
                    <TableCell>u/{month.username}</TableCell>
                    <TableCell>{month.businessName}</TableCell>
                    <TableCell>
                      <div>{month.mergedPrCount}</div>
                      <div className="mt-1 flex max-w-sm flex-col gap-1 text-xs">
                        {month.pullRequests.map((pullRequest) => (
                          <a
                            key={pullRequest.id}
                            href={pullRequest.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2"
                          >
                            #{pullRequest.number} {pullRequest.title} (+{pullRequest.additions}/-
                            {pullRequest.deletions})
                          </a>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {month.additions + month.deletions} lines / {month.changedFiles} files
                    </TableCell>
                    <TableCell>
                      {month.proposedPoints ?? "—"}
                      {month.proposedReason ? (
                        <div className="text-xs text-muted-foreground">{month.proposedReason}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          disabled={finalizeMonth.isPending}
                          onClick={() => {
                            const points = Number(
                              ask("Final credits (1–10)", String(month.proposedPoints ?? 1)),
                            )
                            const reason = ask("Reason", month.proposedReason ?? "")
                            if (!reason || !Number.isInteger(points)) return
                            finalizeMonth.mutate({
                              path: { id: month.id },
                              body: { points, reason },
                            })
                          }}
                        >
                          Finalize
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rejectMonth.isPending}
                          onClick={() => {
                            const reason = ask("Reason for rejection")
                            if (!reason) return
                            rejectMonth.mutate({ path: { id: month.id }, body: { reason } })
                          }}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  )
}
