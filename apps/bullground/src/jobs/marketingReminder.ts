import { crudMarketingVideo, fetchMarketingVideo } from "@lib/dao"
import { db } from "@template-nextjs/db"
import { PLATFORMS, isMarketingPlatform, previousMonthKey } from "@utils/marketing"
import { mentionOwner, postSlack } from "@utils/slack"

/**
 * Tells Andrew when to go and read a video's view count.
 *
 * Views are read by hand -- we have no TikTok developer access -- so the whole program hinges
 * on somebody looking at a number at roughly the right moment. This is that reminder: once a
 * day before the 30-day window closes, and once when it closes.
 *
 * A sweep rather than a delayed job per video. A delayed job would be tidier, but the queue
 * lives in Valkey, and a Valkey that loses its append-only file loses every reminder more
 * than a month out with no way to notice. Reading the deadline out of Postgres every hour
 * cannot drift, and the two `reminder_*_sent_at` columns are what stop it repeating.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000

function describe(video: {
  businessName: string
  submitterUsername: string
  platform: string
  url: string
  measureAt: Date | null
}): string {
  const minViews = isMarketingPlatform(video.platform)
    ? `${PLATFORMS[video.platform].minViews.toLocaleString("en-US")} views to qualify`
    : "unknown platform"
  return `*${video.businessName}* — ${video.url} (by ${video.submitterUsername}, ${minViews})`
}

export async function processMarketingReminder(): Promise<void> {
  const now = new Date()

  const dueSoon = await fetchMarketingVideo(db).listNeedingReminder(
    now,
    ONE_DAY_MS,
    "reminderDayBeforeSentAt",
  )
  for (const video of dueSoon) {
    if (video.measureAt === null) continue
    const sent = await postSlack(
      `${mentionOwner()}Marketing video view count due <!date^${Math.floor(
        video.measureAt.getTime() / 1000,
      )}^{date_short_pretty} at {time}|${video.measureAt.toISOString()}>.\n${describe(video)}`,
    )
    // Only record a reminder that actually reached Slack, so an outage delays it rather than
    // swallowing it.
    if (sent) await crudMarketingVideo(db).markReminderSent(video.id, "reminderDayBeforeSentAt")
  }

  const dueNow = await fetchMarketingVideo(db).listNeedingReminder(now, 0, "reminderDueSentAt")
  for (const video of dueNow) {
    const sent = await postSlack(
      `${mentionOwner()}Read this video's view count *now* — its 30 days are up and views stop counting.\n${describe(
        video,
      )}\nEnter it at /admin/marketing.`,
    )
    if (sent) await crudMarketingVideo(db).markReminderSent(video.id, "reminderDueSentAt")
  }

  await remindAboutMonthlyPayouts(now)
}

/**
 * On the 1st, one nudge that last month's pools are ready.
 *
 * Gated on the hour as well as the day so the hourly sweep sends it once rather than
 * twenty-four times. There is no per-message record to check against here, unlike the
 * per-video reminders, so the clock is the guard.
 */
async function remindAboutMonthlyPayouts(now: Date): Promise<void> {
  if (now.getUTCDate() !== 1 || now.getUTCHours() !== 12) return
  await postSlack(
    `${mentionOwner()}It is the 1st. Marketing pools for ${previousMonthKey(
      now,
    )} are ready to set, calculate and pay at /admin/payouts.`,
  )
}
