import { crudContributionSubmission } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { mentionOwner, postSlack } from "@utils/slack"

/** Turns every live post in the dedicated idea community into one reviewable contribution.
 *  This is deliberately database-reconciled rather than dependent on a fragile post-create hook:
 *  posts committed while Valkey or Slack is unavailable are picked up on the next run. */
export async function reconcileIdeaPosts(): Promise<void> {
  const community = (process.env.SPROUTBIZ_IDEA_COMMUNITY ?? "saasideas").toLowerCase()
  const posts = await db
    .selectFrom("post")
    .innerJoin("community", "community.id", "post.communityId")
    .leftJoin("contributionSubmission", (join) =>
      join
        .onRef("contributionSubmission.postId", "=", "post.id")
        .on("contributionSubmission.type", "=", "idea"),
    )
    .select(["post.id", "post.authorUserId", "contributionSubmission.slackNotifiedAt"])
    .where((eb) => eb.fn("lower", [eb.ref("community.name")]), "=", community)
    .where("post.removedAt", "is", null)
    .where((eb) =>
      eb.or([
        eb("contributionSubmission.id", "is", null),
        eb("contributionSubmission.slackNotifiedAt", "is", null),
      ]),
    )
    .orderBy("post.createdAt", "asc")
    .limit(100)
    .execute()

  for (const post of posts) {
    const result = await crudContributionSubmission(db).createIdeaForPost({
      userId: post.authorUserId,
      postId: post.id,
      evidence: { source: "idea-community-post" },
    })
    if (result.row.slackNotifiedAt === null) {
      const notified = await postSlack(
        `${mentionOwner()}New idea in c/${community} is ready for review: ${process.env.NEXT_PUBLIC_HOST_URL ?? ""}/posting/${post.id}`,
        process.env.SLACK_REVIEW_CHANNEL,
      )
      if (notified) await crudContributionSubmission(db).markSlackNotified(result.row.id)
    }
  }
}
