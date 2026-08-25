import { isSproutOSConfigured, oauthSproutOS, sproutosConfig } from "@website/lib/oauth"
import { CodeChallengeMethod, generateCodeVerifier, generateState } from "arctic"
import { cookies } from "next/headers"

export async function GET(): Promise<Response> {
  if (!isSproutOSConfigured()) {
    return new Response(null, { status: 404 })
  }

  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  // PKCE even though this is a confidential client: it costs nothing and closes the
  // authorization-code interception window if the redirect is ever mishandled.
  const url = oauthSproutOS().createAuthorizationURLWithPKCE(
    sproutosConfig.authorizeUrl!,
    state,
    CodeChallengeMethod.S256,
    codeVerifier,
    sproutosConfig.scopes,
  )

  const cookieStore = await cookies()
  const options = {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    sameSite: "lax" as const,
  }
  cookieStore.set("sproutos_oauth_state", state, options)
  cookieStore.set("sproutos_code_verifier", codeVerifier, options)

  return new Response(null, { status: 302, headers: { Location: url.toString() } })
}
