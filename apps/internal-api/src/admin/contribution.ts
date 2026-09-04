import {
  crudContributionAward,
  crudContributionCodeMonth,
  crudContributionSubmission,
  fetchContributionCodeMonth,
  fetchContributionSubmission,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import { enqueueBusinessProvisioning } from "@utils/queues"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { EmptyObject, ErrorSchemaResponse, IdParamT } from "../utils/common.serializer"
import { throwBadRequest, throwNotFound } from "../utils/http-exception"
import {
  adminAcceptContributionSchemaRequest,
  adminAcceptIdeaSchemaRequest,
  adminContributionAwardSchemaResponse,
  adminContributionReviewSchemaResponse,
  adminRejectContributionSchemaRequest,
} from "./contribution.serializer"
import { adminAuthMiddleware } from "./middleware"

const app: Hono<any> = new Hono()
  .use(adminAuthMiddleware)
  .get(
    "/",
    describeRoute({
      description: "Pending contribution and monthly code review queues",
      responses: {
        200: {
          description: "Review queues",
          content: {
            "application/json": { schema: resolver(adminContributionReviewSchemaResponse) },
          },
        },
      },
    }),
    async (c) => {
      const [submissions, codeMonths] = await Promise.all([
        fetchContributionSubmission(db).listForReview(),
        fetchContributionCodeMonth(db).listForReview(),
      ])
      const businessIds = [
        ...new Set(
          [...submissions, ...codeMonths].flatMap((row) =>
            row.businessId === null ? [] : [row.businessId],
          ),
        ),
      ]
      const pullRequestIds = [
        ...new Set(
          codeMonths.flatMap((row) => {
            const evidence = row.evidence as { pullRequestIds?: unknown }
            return Array.isArray(evidence.pullRequestIds)
              ? evidence.pullRequestIds.filter((id): id is string => typeof id === "string")
              : []
          }),
        ),
      ]
      const feedbackIds = [
        ...new Set(
          submissions.flatMap((row) =>
            row.feedbackSubmissionId === null ? [] : [row.feedbackSubmissionId],
          ),
        ),
      ]
      const [businesses, pullRequests, feedbackRows] = await Promise.all([
        businessIds.length === 0
          ? Promise.resolve([])
          : db
              .selectFrom("business")
              .select(["id", "name"])
              .where("id", "in", businessIds)
              .execute(),
        pullRequestIds.length === 0
          ? Promise.resolve([])
          : db
              .selectFrom("codeContributionPr")
              .select([
                "githubPullRequestId",
                "number",
                "title",
                "url",
                "additions",
                "deletions",
                "changedFiles",
                "labels",
              ])
              .where("githubPullRequestId", "in", pullRequestIds)
              .execute(),
        feedbackIds.length === 0
          ? Promise.resolve([])
          : db
              .selectFrom("contributionSubmission")
              .select(["id", "userId", "evidence"])
              .where("id", "in", feedbackIds)
              .execute(),
      ])
      const userIds = [
        ...new Set([
          ...submissions.map((row) => row.userId),
          ...codeMonths.map((row) => row.userId),
          ...feedbackRows.map((row) => row.userId),
        ]),
      ]
      const users =
        userIds.length === 0
          ? []
          : await db
              .selectFrom("user")
              .select(["id", "username"])
              .where("id", "in", userIds)
              .execute()
      const usernameById = new Map(users.map((user) => [user.id, user.username]))
      const businessNameById = new Map(businesses.map((business) => [business.id, business.name]))
      const feedbackById = new Map(feedbackRows.map((feedback) => [feedback.id, feedback]))
      const pullRequestById = new Map(
        pullRequests.map((pullRequest) => [pullRequest.githubPullRequestId, pullRequest]),
      )
      return c.json({
        submissions: submissions.map((row) => {
          const feedback = row.feedbackSubmissionId
            ? feedbackById.get(row.feedbackSubmissionId)
            : undefined
          return {
            id: row.id,
            userId: row.userId,
            username: usernameById.get(row.userId) ?? "unknown",
            businessId: row.businessId,
            businessName:
              row.businessId === null ? null : (businessNameById.get(row.businessId) ?? null),
            postId: row.postId,
            feedbackSubmissionId: row.feedbackSubmissionId,
            feedbackSubmittedBy: feedback ? (usernameById.get(feedback.userId) ?? "unknown") : null,
            feedbackEvidence: feedback ? (feedback.evidence as Record<string, unknown>) : null,
            evidence: row.evidence as Record<string, unknown>,
            type: row.type,
            status: row.status,
            createdAt: row.createdAt.toISOString(),
          }
        }),
        codeMonths: codeMonths.map((row) => ({
          id: row.id,
          userId: row.userId,
          username: usernameById.get(row.userId) ?? "unknown",
          businessId: row.businessId,
          businessName: businessNameById.get(row.businessId) ?? "Unknown business",
          periodStart:
            row.periodStart instanceof Date
              ? row.periodStart.toISOString().slice(0, 10)
              : String(row.periodStart).slice(0, 10),
          mergedPrCount: row.mergedPrCount,
          additions: row.additions,
          deletions: row.deletions,
          changedFiles: row.changedFiles,
          proposedPoints: row.proposedPoints,
          proposedReason: row.proposedReason,
          pullRequests: (() => {
            const evidence = row.evidence as { pullRequestIds?: unknown }
            const ids = Array.isArray(evidence.pullRequestIds)
              ? evidence.pullRequestIds.filter((id): id is string => typeof id === "string")
              : []
            return ids.flatMap((id) => {
              const pullRequest = pullRequestById.get(id)
              if (!pullRequest) return []
              return [
                {
                  id: pullRequest.githubPullRequestId,
                  number: pullRequest.number,
                  title: pullRequest.title,
                  url: pullRequest.url,
                  additions: pullRequest.additions,
                  deletions: pullRequest.deletions,
                  changedFiles: pullRequest.changedFiles,
                  labels: Array.isArray(pullRequest.labels)
                    ? pullRequest.labels.filter(
                        (label): label is string => typeof label === "string",
                      )
                    : [],
                },
              ]
            })
          })(),
        })),
      })
    },
  )
  .post(
    "/submissions/:id/accept-idea",
    describeRoute({
      description:
        "Accepts an idea and atomically creates its business, community, award, and provisioning record",
      responses: {
        200: {
          description: "Idea accepted",
          content: {
            "application/json": { schema: resolver(adminContributionAwardSchemaResponse) },
          },
        },
        404: {
          description: "Submission not found",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", adminAcceptIdeaSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const body = c.req.valid("json")
      const submission = await fetchContributionSubmission(db).get(id)
      if (!submission) return throwNotFound(c, "Contribution submission not found")
      if (submission.type !== "idea") return throwBadRequest(c, "Submission is not an idea")
      if (
        new Set([
          "www",
          "api",
          "admin",
          "app",
          "dashboard",
          "static",
          "media",
          "auth",
          "login",
          "mail",
          "support",
        ]).has(body.slug)
      ) {
        return throwBadRequest(c, `${body.slug} is reserved and cannot be a business domain`)
      }
      const accepted = await crudContributionAward(db).acceptIdea({
        submissionId: id,
        reviewerUserId: c.var.user.id,
        businessName: body.name,
        businessSlug: body.slug,
        communityName: body.communityName,
        repositoryName: body.repositoryName,
        tagline: body.tagline ?? null,
        description: body.description ?? null,
        platform: body.platform ?? "web",
      })
      await enqueueBusinessProvisioning(accepted.provisioning.id)
      return c.json({
        awardId: accepted.award.id,
        points: accepted.award.points,
        provisioningId: accepted.provisioning.id,
      })
    },
  )
  .post(
    "/submissions/:id/accept",
    validator("param", IdParamT),
    validator("json", adminAcceptContributionSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const body = c.req.valid("json")
      const submission = await fetchContributionSubmission(db).get(id)
      if (!submission) return throwNotFound(c, "Contribution submission not found")
      if (submission.type === "idea" || submission.type === "code") {
        return throwBadRequest(c, "Ideas and code use their dedicated acceptance flows")
      }
      if (submission.type === "feedback" && body.points > 5) {
        return throwBadRequest(c, "Feedback contributions must be awarded 1 to 5 points")
      }
      if (submission.type === "validation" && body.points !== 1) {
        return throwBadRequest(c, "Feedback validation contributions must be awarded 1 point")
      }
      const award = await crudContributionAward(db).acceptSubmission(
        id,
        c.var.user.id,
        body.points,
        body.reason,
      )
      return c.json({ awardId: award.id, points: award.points })
    },
  )
  .post(
    "/submissions/:id/reject",
    validator("param", IdParamT),
    validator("json", adminRejectContributionSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const rejected = await crudContributionSubmission(db).reject(
        id,
        c.var.user.id,
        c.req.valid("json").reason,
      )
      if (!rejected) return throwNotFound(c, "Pending contribution submission not found")
      return c.json({})
    },
  )
  .post(
    "/code-months/:id/finalize",
    validator("param", IdParamT),
    validator("json", adminAcceptContributionSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const body = c.req.valid("json")
      const month = await fetchContributionCodeMonth(db).get(id)
      if (!month) return throwNotFound(c, "Code contribution month not found")
      const award = await crudContributionAward(db).finalizeCodeMonth(
        id,
        c.var.user.id,
        body.points,
        body.reason,
      )
      return c.json({ awardId: award.id, points: award.points })
    },
  )
  .post(
    "/code-months/:id/reject",
    describeRoute({
      responses: {
        200: {
          description: "Code month rejected",
          content: { "application/json": { schema: resolver(EmptyObject) } },
        },
      },
    }),
    validator("param", IdParamT),
    validator("json", adminRejectContributionSchemaRequest),
    async (c) => {
      const { id } = c.req.valid("param")
      const rejected = await crudContributionCodeMonth(db).reject(
        id,
        c.var.user.id,
        c.req.valid("json").reason,
      )
      if (!rejected) return throwNotFound(c, "Pending code contribution month not found")
      return c.json({})
    },
  )

export default app
