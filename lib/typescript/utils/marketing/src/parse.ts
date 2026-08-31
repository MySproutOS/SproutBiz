import { type MarketingPlatform } from "./platforms"

export type ParsedVideo = { platform: MarketingPlatform; externalId: string }

export type ParseFailure = { reason: string }

export type ParseResult = ParsedVideo | ParseFailure

export function isParsedVideo(result: ParseResult): result is ParsedVideo {
  return "platform" in result
}

/**
 * A submitted link, reduced to the pair that identifies the video everywhere else.
 *
 * We store `(platform, externalId)` rather than the URL because the same video has many URLs
 * -- tracking parameters, `m.` and `www.` hosts, the `/reels/` and `/reel/` spellings -- and
 * the "one video pays once, across every business" rule has to survive all of them.
 *
 * Every rejection returns a sentence we can show the submitter directly. A link that we
 * cannot resolve without a network request is refused rather than fetched: this runs inside
 * a request handler, and a shortener is not a stable identifier anyway.
 */
export function parseVideoUrl(input: string): ParseResult {
  const trimmed = input.trim()
  if (trimmed === "") {
    return { reason: "Paste a link to your video." }
  }

  let url: URL
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
  } catch {
    return { reason: "That is not a valid link." }
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|vm|vt)\./, "")
  const segments = url.pathname.split("/").filter(Boolean)

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (segments[0] === "shorts" && segments[1]) {
      return { platform: "youtube_short", externalId: segments[1] }
    }
    if (segments[0] === "watch" || url.searchParams.has("v")) {
      return {
        reason:
          "That is a normal YouTube watch link. Open the video on YouTube and copy its /shorts/ link -- we only accept Shorts.",
      }
    }
    return { reason: "We only accept YouTube Shorts links (youtube.com/shorts/...)." }
  }

  if (host === "youtu.be") {
    if (segments[0]) {
      return { platform: "youtube_short", externalId: segments[0] }
    }
    return { reason: "That youtu.be link has no video in it." }
  }

  if (host === "tiktok.com") {
    // vm.tiktok.com / vt.tiktok.com shorteners normalise to this host once the subdomain is
    // stripped, but their path is an opaque code rather than a video id.
    if (/^(vm|vt)\./.test(url.hostname.toLowerCase())) {
      return {
        reason:
          "That is a TikTok share shortener. Open the video in the app or on the web and paste the full tiktok.com/@user/video/... link.",
      }
    }
    if (segments[1] === "photo") {
      return { reason: "TikTok slideshows are not accepted -- the advert has to be a video." }
    }
    const videoIndex = segments.indexOf("video")
    const id = videoIndex === -1 ? undefined : segments[videoIndex + 1]
    if (id && /^\d+$/.test(id)) {
      return { platform: "tiktok", externalId: id }
    }
    return {
      reason: "Paste the full TikTok video link, which looks like tiktok.com/@user/video/1234...",
    }
  }

  if (host === "instagram.com") {
    const [kind, code] = segments
    if ((kind === "reel" || kind === "reels") && code) {
      return { platform: "instagram_reel", externalId: code }
    }
    if (kind === "p" && code) {
      return { platform: "instagram_post", externalId: code }
    }
    // Stories expire, so there is nothing left to measure at day 30.
    if (kind === "stories") {
      return { reason: "Instagram Stories disappear before we can count them." }
    }
    return { reason: "Paste a link to an Instagram Reel or post." }
  }

  return {
    reason: "We accept YouTube Shorts, TikTok videos, and Instagram Reels and posts.",
  }
}

/** The canonical link we show on the public payouts page, rebuilt from what we stored. */
export function canonicalVideoUrl(platform: MarketingPlatform, externalId: string): string {
  switch (platform) {
    case "youtube_short":
      return `https://www.youtube.com/shorts/${externalId}`
    case "tiktok":
      return `https://www.tiktok.com/video/${externalId}`
    case "instagram_reel":
      return `https://www.instagram.com/reel/${externalId}/`
    case "instagram_post":
      return `https://www.instagram.com/p/${externalId}/`
  }
}
