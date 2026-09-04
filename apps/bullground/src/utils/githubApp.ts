import { createSign } from "node:crypto"

const tokenCache = new Map<string, { token: string; expiresAt: number }>()

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url")
}

function requestHeaders(
  defaults: RequestInit["headers"],
  overrides?: RequestInit["headers"],
): Headers {
  const headers = new Headers(defaults)
  new Headers(overrides).forEach((value, key) => {
    headers.set(key, value)
  })
  return headers
}

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function normalizeGithubPrivateKey(value: string): string {
  // Compose env files are frequently generated through one extra serialization layer, which
  // turns the documented `\n` separators into `\\n`. Accept both forms so a valid GitHub App
  // key does not become unreadable merely because it passed through a deployment UI or script.
  return value.replaceAll("\\\\n", "\n").replaceAll("\\n", "\n")
}

function githubAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
    ? normalizeGithubPrivateKey(process.env.GITHUB_APP_PRIVATE_KEY)
    : undefined
  if (!appId || !privateKey)
    throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY are required")
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iat: now - 30,
    exp: now + 9 * 60,
    iss: appId,
  })}`
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url")
  return `${unsigned}.${signature}`
}

async function installationToken(installationId: string): Promise<string> {
  const cached = tokenCache.get(installationId)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const response = await fetch(
    `https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubAppJwt()}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SproutBiz automation",
      },
    },
  )
  if (!response.ok) throw new Error(`GitHub installation token failed (${response.status})`)
  const body = (await response.json()) as { token: string; expires_at: string }
  tokenCache.set(installationId, { token: body.token, expiresAt: Date.parse(body.expires_at) })
  return body.token
}

export async function githubAppRequest<T>(
  installationId: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: requestHeaders(
      {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${await installationToken(installationId)}`,
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "SproutBiz automation",
      },
      init.headers,
    ),
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000)
    throw new GithubApiError(
      response.status,
      `GitHub ${init.method ?? "GET"} ${path} failed (${response.status}): ${detail}`,
    )
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
