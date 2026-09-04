import { issueAccessToken, redeemCode } from "../store"
import { stubDisabled } from "../guard"

/** Stub token endpoint. Accepts the form-encoded body arctic sends. */
export async function POST(request: Request): Promise<Response> {
  if (stubDisabled(request)) return new Response(null, { status: 404 })

  const form = await request.formData()
  const code = form.get("code")
  if (typeof code !== "string") {
    return Response.json({ error: "invalid_request" }, { status: 400 })
  }

  const claims = redeemCode(code)
  if (!claims) {
    return Response.json({ error: "invalid_grant" }, { status: 400 })
  }

  return Response.json({
    access_token: issueAccessToken(claims),
    token_type: "Bearer",
    expires_in: 3600,
    scope: "openid email profile github:identity",
  })
}
