import { issueCode } from "./store"
import { stubDisabled } from "./guard"

/**
 * Stub authorization endpoint.
 *
 * Stands in for the real SproutOS authorize screen: it skips the consent UI and redirects
 * straight back with a code, so the application's own flow -- state, PKCE, code exchange,
 * userinfo, account linking -- runs exactly as it will in production.
 */
export function GET(request: Request): Response {
  if (stubDisabled(request)) return new Response(null, { status: 404 })

  const url = new URL(request.url)
  const redirectUri = url.searchParams.get("redirect_uri")
  const state = url.searchParams.get("state")
  if (!redirectUri || !state) {
    return new Response("missing redirect_uri or state", { status: 400 })
  }

  const email = url.searchParams.get("email") ?? "agent@sproutos.local"
  const sub = url.searchParams.get("sub") ?? `sproutos-dev-${email}`
  const name = url.searchParams.get("name") ?? "SproutOS Dev Agent"
  const githubUserId = url.searchParams.get("github_user_id") ?? "100000001"
  const githubLogin = url.searchParams.get("github_login") ?? "sproutos-dev-agent"

  const code = issueCode({ sub, email, name, githubUserId, githubLogin })
  const target = new URL(redirectUri)
  target.searchParams.set("code", code)
  target.searchParams.set("state", state)

  return new Response(null, { status: 302, headers: { Location: target.toString() } })
}
