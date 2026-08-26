import { completeOAuthLogin } from "@website/lib/oauth-user"
import { isSproutOSConfigured, oauthSproutOS, sproutosConfig } from "@website/lib/oauth"
import type { OAuth2Tokens } from "arctic"
import { cookies } from "next/headers"

/**
 * SproutOS's profile endpoint. Note what is *not* here: a subject.
 *
 * The identity comes from two calls rather than one. SproutOS issues opaque access tokens
 * (no id_token to decode), and its profile endpoint returns a name and an email but no stable
 * id. An email is not an identity -- it can be changed, and freed addresses get reassigned --
 * so keying an account on it would eventually hand one person another person's account.
 */
type SproutOSProfile = {
  email?: string
  name?: string | null
}

/** RFC 7662 introspection. `sub` is the stable subject the account is keyed on. */
type SproutOSIntrospection = {
  active?: boolean
  sub?: string
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

  let profile: SproutOSProfile
  let introspection: SproutOSIntrospection
  try {
    const [profileResponse, introspectResponse] = await Promise.all([
      fetch(sproutosConfig.userinfoUrl!, {
        headers: { Authorization: `Bearer ${tokens.accessToken()}` },
      }),
      // Introspection authenticates the *client*, not the user, so the credentials go in the
      // body rather than the Authorization header -- that header carries the access token.
      fetch(sproutosConfig.introspectUrl!, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: tokens.accessToken(),
          token_type_hint: "access_token",
          client_id: sproutosConfig.clientId!,
          client_secret: sproutosConfig.clientSecret!,
        }),
      }),
    ])
    if (!profileResponse.ok || !introspectResponse.ok) {
      return new Response(null, { status: 400 })
    }
    profile = (await profileResponse.json()) as SproutOSProfile
    introspection = (await introspectResponse.json()) as SproutOSIntrospection
  } catch {
    return new Response(null, { status: 400 })
  }

  // A token the provider reports as inactive must not produce a session, even though the
  // exchange that produced it succeeded a moment ago.
  if (introspection.active !== true) {
    return new Response(null, { status: 400 })
  }

  const providerAccountId = introspection.sub
  const email = profile.email
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
      name: profile.name ?? null,
      image: null,
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
