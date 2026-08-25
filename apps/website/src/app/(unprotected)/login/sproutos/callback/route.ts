import { completeOAuthLogin } from "@website/lib/oauth-user"
import { isSproutOSConfigured, oauthSproutOS, sproutosConfig } from "@website/lib/oauth"
import type { OAuth2Tokens } from "arctic"
import { cookies } from "next/headers"

/**
 * Claims we read from the userinfo endpoint.
 *
 * Unlike Google, SproutOS is not assumed to issue a JWT id_token, so the identity is
 * fetched from userinfo rather than decoded from the token. That also keeps this working
 * against providers that return an opaque access token.
 */
type SproutOSUserInfo = {
  sub?: string
  id?: string
  email?: string
  name?: string | null
  picture?: string | null
}

export async function GET(request: Request): Promise<Response> {
  if (!isSproutOSConfigured()) {
    return new Response(null, { status: 404 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  const cookieStore = await cookies()
  const storedState = cookieStore.get("sproutos_oauth_state")?.value ?? null
  const codeVerifier = cookieStore.get("sproutos_code_verifier")?.value ?? null
  cookieStore.delete("sproutos_oauth_state")
  cookieStore.delete("sproutos_code_verifier")

  if (code === null || state === null || storedState === null || codeVerifier === null) {
    return new Response(null, { status: 400 })
  }
  if (state !== storedState) {
    return new Response(null, { status: 400 })
  }

  let tokens: OAuth2Tokens
  try {
    tokens = await oauthSproutOS().validateAuthorizationCode(
      sproutosConfig.tokenUrl!,
      code,
      codeVerifier,
    )
  } catch {
    // Invalid code or client credentials
    return new Response(null, { status: 400 })
  }

  let claims: SproutOSUserInfo
  try {
    const response = await fetch(sproutosConfig.userinfoUrl!, {
      headers: { Authorization: `Bearer ${tokens.accessToken()}` },
    })
    if (!response.ok) return new Response(null, { status: 400 })
    claims = (await response.json()) as SproutOSUserInfo
  } catch {
    return new Response(null, { status: 400 })
  }

  const providerAccountId = claims.sub ?? claims.id
  const email = claims.email
  // Without a stable subject and an email there is no identity to link an account to, and
  // guessing one would risk joining two different people onto the same user.
  if (!providerAccountId || !email) {
    return new Response(null, { status: 400 })
  }

  const { isNewAccount } = await completeOAuthLogin(
    "sproutos",
    {
      providerAccountId,
      email,
      name: claims.name ?? null,
      image: claims.picture ?? null,
    },
    {
      scope: tokens.scopes().join(" "),
      idToken: null,
      accessToken: tokens.accessToken(),
      tokenType: tokens.tokenType(),
      expiresAt: null,
    },
  )

  return new Response(null, {
    status: 302,
    headers: { Location: isNewAccount ? "/onboarding" : "/" },
  })
}
