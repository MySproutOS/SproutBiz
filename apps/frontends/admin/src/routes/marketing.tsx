import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Badge } from "@ui/base/ui/badge"
import { Button } from "@ui/base/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ui/base/ui/dialog"
import { Input } from "@ui/base/ui/input"
import { Label } from "@ui/base/ui/label"
import { LoadingButton } from "@ui/base/ui/loading-button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@ui/base/ui/table"
import { Textarea } from "@ui/base/ui/textarea"
import {
  getApiAdminMarketingVideosOptions,
  getApiAdminMarketingVideosQueryKey,
  postApiAdminMarketingVideosByIdApproveMutation,
  postApiAdminMarketingVideosByIdRejectMutation,
  postApiAdminMarketingVideosByIdViewsMutation,
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

export const Route = createFileRoute("/marketing")({
  component: MarketingPage,
})

const STATUSES = ["pending", "approved", "measured", "rejected", "paid"] as const
type Status = (typeof STATUSES)[number]

/** A local ISO string that <input type="datetime-local"> accepts. */
function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formatDateTime(iso: string | null): string {
  return iso === null ? "—" : new Date(iso).toLocaleString()
}

function MarketingPage() {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState<Status | "queue">("queue")
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [viewsId, setViewsId] = useState<string | null>(null)

  const [postedAt, setPostedAt] = useState(toLocalInput(new Date()))
  const [durationSeconds, setDurationSeconds] = useState("30")
  const [reason, setReason] = useState("")
  const [viewCount, setViewCount] = useState("")

  const listOptions = getApiAdminMarketingVideosOptions(
    status === "queue" ? {} : { query: { status } },
  )
  const { data, isLoading } = useQuery(listOptions)
  const videos = data?.data ?? []

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: getApiAdminMarketingVideosQueryKey() })
  }

  const approve = useMutation({
    ...postApiAdminMarketingVideosByIdApproveMutation(),
    onSuccess: () => {
      toast.success("Approved. The 30-day window is running.")
      setApproveId(null)
      invalidate()
    },
    onError,
  })

  const reject = useMutation({
    ...postApiAdminMarketingVideosByIdRejectMutation(),
    onSuccess: () => {
      toast.success("Rejected.")
      setRejectId(null)
      setReason("")
      invalidate()
    },
    onError,
  })

  const recordViews = useMutation({
    ...postApiAdminMarketingVideosByIdViewsMutation(),
    onSuccess: () => {
      toast.success("View count recorded.")
      setViewsId(null)
      setViewCount("")
      invalidate()
    },
    onError,
  })

  const viewsTarget = videos.find((video) => video.id === viewsId)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Marketing videos</h1>
        <p className="text-muted-foreground">
          Approve videos that genuinely showcase the product, then read their view count when Slack
          says the 30 days are up. Views are entered by hand — nothing here fetches them.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={status === "queue" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setStatus("queue")
          }}
        >
          Needs action
        </Button>
        {STATUSES.map((value) => (
          <Button
            key={value}
            variant={status === value ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setStatus(value)
            }}
          >
            {value}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : videos.length === 0 ? (
        <p className="text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Video</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Submitter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check views at</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Weighted</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {videos.map((video) => (
                <TableRow key={video.id}>
                  <TableCell>
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {video.platformLabel}
                    </a>
                    <div className="max-w-[22rem] truncate text-xs text-muted-foreground">
                      {video.url}
                    </div>
                  </TableCell>
                  <TableCell>{video.businessName}</TableCell>
                  <TableCell>{video.submitterUsername}</TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <Badge variant={video.status === "rejected" ? "secondary" : "default"}>
                        {video.status}
                      </Badge>
                      {video.rejectionReason && (
                        <span className="text-xs text-muted-foreground">
                          {video.rejectionReason}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {formatDateTime(video.measureAt)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {video.viewCount === null ? "—" : video.viewCount.toLocaleString()}
                    {video.viewCount !== null && !video.meetsMinimum && (
                      <div className="text-xs text-destructive">
                        under {video.minViews.toLocaleString()}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {video.weightedViews === null ? "—" : video.weightedViews.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      {video.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() => {
                              setApproveId(video.id)
                              setPostedAt(toLocalInput(new Date()))
                              setDurationSeconds("30")
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRejectId(video.id)
                              setReason("")
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                      {(video.status === "approved" || video.status === "measured") && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setViewsId(video.id)
                            setViewCount(video.viewCount === null ? "" : String(video.viewCount))
                          }}
                        >
                          {video.status === "measured" ? "Edit views" : "Enter views"}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog
        open={approveId !== null}
        onOpenChange={(open) => {
          if (!open) setApproveId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve video</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="posted-at">When the video was created</Label>
              <Input
                id="posted-at"
                type="datetime-local"
                value={postedAt}
                onChange={(event) => {
                  setPostedAt(event.target.value)
                }}
              />
              <p className="text-xs text-muted-foreground">
                The 30-day counting window starts here, not at submission. Take it from the post
                itself.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">Length in seconds</Label>
              <Input
                id="duration"
                type="number"
                min={1}
                value={durationSeconds}
                onChange={(event) => {
                  setDurationSeconds(event.target.value)
                }}
              />
              <p className="text-xs text-muted-foreground">
                Under 20 seconds does not qualify; the server will refuse it.
              </p>
            </div>
          </div>
          <DialogFooter>
            <LoadingButton
              loading={approve.isPending}
              onClick={() => {
                if (approveId === null) return
                approve.mutate({
                  path: { id: approveId },
                  body: {
                    postedAt: new Date(postedAt),
                    durationSeconds: Number(durationSeconds),
                  },
                })
              }}
            >
              Approve
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={rejectId !== null}
        onOpenChange={(open) => {
          if (!open) setRejectId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject video</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
              }}
              placeholder="Does not showcase the product / under 20 seconds / slideshow"
            />
            <p className="text-xs text-muted-foreground">The submitter sees this.</p>
          </div>
          <DialogFooter>
            <LoadingButton
              variant="destructive"
              loading={reject.isPending}
              disabled={reason.trim() === ""}
              onClick={() => {
                if (rejectId === null) return
                reject.mutate({ path: { id: rejectId }, body: { reason } })
              }}
            >
              Reject
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewsId !== null}
        onOpenChange={(open) => {
          if (!open) setViewsId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record view count</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {viewsTarget && (
              <p className="text-sm text-muted-foreground">
                {viewsTarget.platformLabel} &mdash; needs {viewsTarget.minViews.toLocaleString()}{" "}
                views to earn anything.{" "}
                <a href={viewsTarget.url} target="_blank" rel="noreferrer" className="underline">
                  Open the video
                </a>
              </p>
            )}
            <Label htmlFor="view-count">Views at the 30-day mark</Label>
            <Input
              id="view-count"
              type="number"
              min={0}
              value={viewCount}
              onChange={(event) => {
                setViewCount(event.target.value)
              }}
            />
          </div>
          <DialogFooter>
            <LoadingButton
              loading={recordViews.isPending}
              disabled={viewCount.trim() === ""}
              onClick={() => {
                if (viewsId === null) return
                recordViews.mutate({
                  path: { id: viewsId },
                  body: { viewCount: Number(viewCount) },
                })
              }}
            >
              Record
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
