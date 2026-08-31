/**
 * Posting to the Slack channel where Andrew answers things only he can answer.
 *
 * `ops/monitor/monitor.mjs` does the same job by shelling out to the `slack` CLI, which is
 * fine on a laptop and useless here: this runs inside forum_bullground, where that binary
 * does not exist. Plain fetch against the Web API, no SDK.
 */

const SLACK_POST_MESSAGE_URL = "https://slack.com/api/chat.postMessage"

export type SlackConfig = {
  token: string
  channel: string
  ownerUserId: string | undefined
}

export function slackConfig(): SlackConfig | null {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_UNBLOCK_CHANNEL
  if (!token || !channel) return null
  return { token, channel, ownerUserId: process.env.SLACK_OWNER_USER_ID }
}

/** `<@U123>` when we know who to wake, an empty string when we do not. */
export function mentionOwner(): string {
  const ownerUserId = process.env.SLACK_OWNER_USER_ID
  return ownerUserId ? `<@${ownerUserId}> ` : ""
}

/**
 * Sends a message, or does nothing if Slack is not configured.
 *
 * Deliberately never throws: a reminder that cannot be delivered must not fail the job that
 * was going to mark it as delivered, or the next run would send the same reminder again.
 * Returns whether it actually went out, so callers only record a send that happened.
 */
export async function postSlack(text: string): Promise<boolean> {
  const config = slackConfig()
  if (config === null) {
    console.warn("[slack] SLACK_BOT_TOKEN/SLACK_UNBLOCK_CHANNEL unset, dropping message:", text)
    return false
  }

  try {
    const response = await fetch(SLACK_POST_MESSAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        channel: config.channel,
        text,
        // Link previews of TikTok and YouTube URLs would make every reminder a wall of
        // embeds in a channel meant to be skimmed.
        unfurl_links: false,
        unfurl_media: false,
      }),
    })
    const body = (await response.json()) as { ok?: boolean; error?: string }
    if (body.ok !== true) {
      console.error("[slack] chat.postMessage failed:", body.error ?? response.status)
      return false
    }
    return true
  } catch (error) {
    console.error("[slack] chat.postMessage threw:", error)
    return false
  }
}
