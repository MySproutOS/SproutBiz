import { describe, expect, it } from "vitest"
import { canonicalVideoUrl, isParsedVideo, parseVideoUrl } from "./parse"

function parsed(url: string) {
  const result = parseVideoUrl(url)
  if (!isParsedVideo(result)) {
    throw new Error(`expected ${url} to parse, got: ${result.reason}`)
  }
  return result
}

function rejected(url: string) {
  const result = parseVideoUrl(url)
  if (isParsedVideo(result)) {
    throw new Error(`expected ${url} to be rejected, got ${result.platform}/${result.externalId}`)
  }
  return result.reason
}

describe("parseVideoUrl", () => {
  it("accepts YouTube Shorts in every host spelling", () => {
    for (const url of [
      "https://www.youtube.com/shorts/abc123XYZ_-",
      "https://youtube.com/shorts/abc123XYZ_-",
      "https://m.youtube.com/shorts/abc123XYZ_-?feature=share",
      "youtube.com/shorts/abc123XYZ_-",
    ]) {
      expect(parsed(url)).toEqual({ platform: "youtube_short", externalId: "abc123XYZ_-" })
    }
    expect(parsed("https://youtu.be/abc123XYZ_-")).toEqual({
      platform: "youtube_short",
      externalId: "abc123XYZ_-",
    })
  })

  it("rejects a normal YouTube watch link, because we cannot tell it is a Short", () => {
    expect(rejected("https://www.youtube.com/watch?v=abc123XYZ_-")).toMatch(/shorts/i)
  })

  it("accepts a full TikTok video link", () => {
    expect(parsed("https://www.tiktok.com/@someone/video/7123456789012345678")).toEqual({
      platform: "tiktok",
      externalId: "7123456789012345678",
    })
  })

  it("rejects TikTok slideshows", () => {
    expect(rejected("https://www.tiktok.com/@someone/photo/7123456789012345678")).toMatch(
      /slideshow/i,
    )
  })

  it("rejects TikTok share shorteners rather than resolving them", () => {
    expect(rejected("https://vm.tiktok.com/ZMabcdefg/")).toMatch(/full tiktok\.com/i)
    expect(rejected("https://vt.tiktok.com/ZMabcdefg/")).toMatch(/full tiktok\.com/i)
  })

  it("tells Reels and posts apart", () => {
    expect(parsed("https://www.instagram.com/reel/Cxyz123/")).toEqual({
      platform: "instagram_reel",
      externalId: "Cxyz123",
    })
    expect(parsed("https://www.instagram.com/reels/Cxyz123/")).toEqual({
      platform: "instagram_reel",
      externalId: "Cxyz123",
    })
    expect(parsed("https://instagram.com/p/Cxyz123/?igsh=tracking")).toEqual({
      platform: "instagram_post",
      externalId: "Cxyz123",
    })
  })

  it("rejects Instagram Stories, which expire before day 30", () => {
    expect(rejected("https://www.instagram.com/stories/someone/123/")).toMatch(/disappear/i)
  })

  it("rejects everything else with a usable sentence", () => {
    expect(rejected("https://vimeo.com/123456")).toMatch(/YouTube Shorts/)
    expect(rejected("")).toMatch(/Paste a link/)
    expect(rejected("not a url at all !!")).toMatch(/valid link/)
  })

  it("normalises the same video submitted in different shapes to one identity", () => {
    const a = parsed("https://www.instagram.com/reel/Cxyz123/")
    const b = parsed("https://m.instagram.com/reels/Cxyz123/?utm_source=ig_web")
    expect(a).toEqual(b)
  })

  it("round-trips through canonicalVideoUrl", () => {
    for (const url of [
      "https://www.youtube.com/shorts/abc123XYZ_-",
      "https://www.tiktok.com/@someone/video/7123456789012345678",
      "https://www.instagram.com/reel/Cxyz123/",
      "https://www.instagram.com/p/Cxyz123/",
    ]) {
      const first = parsed(url)
      expect(parsed(canonicalVideoUrl(first.platform, first.externalId))).toEqual(first)
    }
  })
})
