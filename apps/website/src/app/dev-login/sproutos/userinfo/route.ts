import { lookupAccessToken } from "../store"
import { stubDisabled } from "../guard"

/** Stub userinfo endpoint, returning the claims the callback maps to an identity. */
export function GET(request: Request): Response {
  if (stubDisabled(request)) return new Response(null, { status: 404 })

  const header = request.headers.get("Authorization") ?? ""
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1]
  if (!token) return Response.json({ error: "invalid_token" }, { status: 401 })

  const claims = lookupAccessToken(token)
  if (!claims) return Response.json({ error: "invalid_token" }, { status: 401 })

  return Response.json({
    sub: claims.sub,
    email: claims.email,
    name: claims.name,
    picture: null,
    github_user_id: claims.githubUserId,
    github_login: claims.githubLogin,
  })
}
