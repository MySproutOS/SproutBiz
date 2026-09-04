import { describe, expect, it } from "vitest"

import { normalizeGithubPrivateKey } from "./githubApp"

describe("normalizeGithubPrivateKey", () => {
  it("normalizes ordinary escaped PEM newlines", () => {
    expect(normalizeGithubPrivateKey(String.raw`header\nbody\nfooter`)).toBe("header\nbody\nfooter")
  })

  it("normalizes PEM newlines escaped through an additional serialization layer", () => {
    expect(normalizeGithubPrivateKey(String.raw`header\\nbody\\nfooter`)).toBe(
      "header\nbody\nfooter",
    )
  })
})
