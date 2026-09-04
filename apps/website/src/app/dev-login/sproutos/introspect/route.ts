import { stubDisabled } from "../guard"
import { lookupAccessToken } from "../store"

/** Local RFC 7662-shaped introspection endpoint used by both the website callback and API. */
export async function POST(request: Request): Promise<Response> {
  if (stubDisabled(request)) return new Response(null, { status: 404 })

  const form = await request.formData()
  const token = form.get("token")
  if (typeof token !== "string") return Response.json({ active: false })

  const claims = lookupAccessToken(token)
  if (!claims) return Response.json({ active: false })

  return Response.json({
    active: true,
    sub: claims.sub,
    scope: "openid email profile github:identity",
  })
}
