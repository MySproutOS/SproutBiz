import {
  crudContributionSubmission,
  fetchBusiness,
  fetchContributionAward,
  fetchContributionSubmission,
  fetchCommunity,
  fetchPost,
  fetchUserExternalIdentity,
} from "@lib/dao"
import { db } from "@template-nextjs/db"
import type { Json } from "@template-nextjs/db"
import { mentionOwner, postSlack } from "@utils/slack"
import { Hono } from "hono"
import { describeRoute } from "hono-typebox-openapi"
import { resolver, validator } from "hono-typebox-openapi/typebox"
import { authMiddleware, requireScope } from "../middleware"
import { ErrorSchemaResponse } from "../utils/common.serializer"
import { throwBadRequest } from "../utils/http-exception"
import {
  contributionProfileSchemaResponse,
  contributionSubmissionSchemaRequest,
  contributionSubmissionSchemaResponse,
  pendingFeedbackSchemaResponse,
} from "./contribution.serializer"

function serializeSubmission(row: {
  id: string
  type: string
  businessId: string | null
  postId: string | null
  feedbackSubmissionId: string | null
  status: string
  reviewReason: string | null
  createdAt: Date
}) {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

const app = new Hono()
  .use(authMiddleware)
  .get(
    "/pending-feedback",
    describeRoute({
      description: "Pending feedback reports available for independent validation",
      responses: {
        200: {
          description: "Pending feedback",
          content: { "application/json": { schema: resolver(pendingFeedbackSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const rows = await fetchContributionSubmission(db).listPendingFeedback()
      return c.json({
        data: rows.map((row) => ({
          ...row,
          evidence: row.evidence as Record<string, unknown>,
          createdAt: row.createdAt.toISOString(),
        })),
      })
    },
  )
  .get(
    "/me",
    describeRoute({
      description: "Contribution points, submissions, and verified GitHub identity for the user",
      responses: {
        200: {
          description: "Contribution profile",
          content: { "application/json": { schema: resolver(contributionProfileSchemaResponse) } },
        },
      },
    }),
    async (c) => {
      const [summary, awards, submissions, github] = await Promise.all([
        fetchContributionAward(db).summarizeForUser(c.var.user.id),
        fetchContributionAward(db).listForUser(c.var.user.id),
        fetchContributionSubmission(db).listForUser(c.var.user.id),
        fetchUserExternalIdentity(db).getForUser(c.var.user.id, "github"),
      ])
      return c.json({
        totalPoints: summary.total,
        github: github
          ? {
              userId: github.providerSubject,
              login: github.handle,
              verifiedAt: github.verifiedAt.toISOString(),
            }
          : null,
        byBusiness: summary.byBusiness,
        awards: awards.map((award) => ({
          id: award.id,
          businessId: award.businessId,
          type: award.type,
          points: award.points,
          reason: award.reason,
          createdAt: award.createdAt.toISOString(),
        })),
        submissions: submissions.map(serializeSubmission),
      })
    },
  )
  .post(
    "/",
    requireScope("contribution:write"),
    describeRoute({
      description: "Submits an idea, feedback report, or validation for human review",
      responses: {
        201: {
          description: "Submission created",
          content: {
            "application/json": { schema: resolver(contributionSubmissionSchemaResponse) },
          },
        },
        400: {
          description: "Invalid contribution relationship",
          content: { "application/json": { schema: resolver(ErrorSchemaResponse) } },
        },
      },
    }),
    validator("json", contributionSubmissionSchemaRequest),
    async (c) => {
      const body = c.req.valid("json")
      if (body.type === "idea" && !body.postId) {
        return throwBadRequest(c, "Ideas must reference their forum post")
      }
      if (body.type === "idea" && body.postId) {
        const post = await fetchPost(db).getOne(body.postId, [
          "authorUserId",
          "communityId",
          "removedAt",
        ])
        if (!post || post.authorUserId !== c.var.user.id) {
          return throwBadRequest(c, "Ideas must reference a forum post authored by you")
        }
        if (post.removedAt !== null) {
          return throwBadRequest(c, "Removed forum posts cannot be submitted as ideas")
        }
        const community = post.communityId
          ? await fetchCommunity(db).getOne(post.communityId, ["name"])
          : undefined
        const requiredCommunity = process.env.SPROUTBIZ_IDEA_COMMUNITY ?? "saasideas"
        if (community?.name.toLowerCase() !== requiredCommunity.toLowerCase()) {
          return throwBadRequest(c, `Ideas must be posted in c/${requiredCommunity}`)
        }
        const result = await crudContributionSubmission(db).createIdeaForPost({
          userId: c.var.user.id,
          postId: body.postId,
          evidence: body.evidence as Json,
        })
        if (result.created) {
          const notified = await postSlack(
            `${mentionOwner()}New idea in c/${requiredCommunity} is ready for review: ${process.env.NEXT_PUBLIC_HOST_URL ?? ""}/posting/${body.postId}`,
            process.env.SLACK_REVIEW_CHANNEL,
          )
          if (notified) await crudContributionSubmission(db).markSlackNotified(result.row.id)
        }
        return c.json({ data: serializeSubmission(result.row) }, 201)
      }
      const businessId = body.businessId
      if (!businessId) {
        return throwBadRequest(c, "Feedback and validation must reference a business")
      }
      const business = await fetchBusiness(db).getOne(businessId, ["id"])
      if (!business) return throwBadRequest(c, "Contribution business does not exist")
      if (body.type === "validation") {
        if (!body.feedbackSubmissionId) {
          return throwBadRequest(c, "Validation must reference the feedback it tests")
        }
        const feedback = await fetchContributionSubmission(db).get(body.feedbackSubmissionId)
        if (
          !feedback ||
          feedback.type !== "feedback" ||
          feedback.status !== "pending" ||
          feedback.businessId !== businessId
        ) {
          return throwBadRequest(c, "Validation must reference pending feedback for this business")
        }
        if (feedback.userId === c.var.user.id) {
          return throwBadRequest(c, "You cannot validate your own feedback")
        }
        const result = await crudContributionSubmission(db).createValidation({
          userId: c.var.user.id,
          businessId,
          feedbackSubmissionId: body.feedbackSubmissionId,
          evidence: body.evidence as Json,
        })
        if (result.created) {
          await postSlack(
            `${mentionOwner()}New validation contribution is ready for review: ${process.env.NEXT_PUBLIC_HOST_URL ?? ""}/admin/contributions`,
            process.env.SLACK_REVIEW_CHANNEL,
          )
        }
        return c.json({ data: serializeSubmission(result.row) }, 201)
      }
      const submission = await crudContributionSubmission(db).create({
        userId: c.var.user.id,
        type: body.type,
        businessId,
        postId: body.postId ?? null,
        codeContributionPrId: null,
        feedbackSubmissionId: null,
        evidence: body.evidence as Json,
      })
      await postSlack(
        `${mentionOwner()}New ${body.type} contribution is ready for review: ${process.env.NEXT_PUBLIC_HOST_URL ?? ""}/admin/contributions`,
        process.env.SLACK_REVIEW_CHANNEL,
      )
      return c.json({ data: serializeSubmission(submission) }, 201)
    },
  )

export default app
