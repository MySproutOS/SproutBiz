import { completeOAuthLogin } from "@website/lib/oauth-user"
import { isSproutOSConfigured, sproutosConfig } from "@website/lib/oauth"
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

/**
 * Exchanges the authorization code for an access token.
 *
 * Done with a direct request rather than through arctic, because arctic sends client
 * credentials as HTTP Basic auth and SproutOS requires `client_id` in the form body -- its
 * token endpoint validates the body against a schema, so a Basic-auth-only request is rejected
 * before the handler ever runs, with a validation error rather than an OAuth one.
 */
async function exchangeCodeForToken(code: string, codeVerifier: string): Promise<string> {
  const response = await fetch(sproutosConfig.tokenUrl!, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: sproutosConfig.clientId!,
      client_secret: sproutosConfig.clientSecret!,
      code,
      // Re-sent because the provider re-checks it at redemption: a code obtained through one
      // registered URI must not be redeemable against another.
      redirect_uri: `${process.env.NEXT_PUBLIC_HOST_URL}/login/sproutos/callback`,
      code_verifier: codeVerifier,
    }),
  })

  const body = (await response.json()) as { access_token?: string; error_description?: string }
  if (!response.ok || !body.access_token) {
    throw new Error(
      `token endpoint returned ${response.status}: ${body.error_description ?? JSON.stringify(body).slice(0, 200)}`,
    )
  }
  return body.access_token
}

export async function GET(request: Request): Promise<Response> {
  if (!isSproutOSConfigured()) {
    return new Response(null, { status: 404 })
  }

  const url = new URL(request.url)

  // The provider reports refusals by redirecting back with ?error=, not by failing the
  // redirect. Without this the user lands on a bare 400 and the actual reason -- a bad scope,
  // a withdrawn consent -- is only visible in the URL they cannot read.
  const providerError = url.searchParams.get("error")
  if (providerError !== null) {
    const description = url.searchParams.get("error_description") ?? providerError
    console.error(`SproutOS sign-in refused: ${providerError}: ${description}`)
    return new Response(null, {
      status: 302,
      headers: { Location: `/login?error=${encodeURIComponent(providerError)}` },
    })
  }

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

  let accessToken: string
  try {
    accessToken = await exchangeCodeForToken(code, codeVerifier)
  } catch (error) {
    // Invalid code, bad client credentials, or a redirect_uri that does not match the one the
    // code was issued against. Logged with the reason: a silent 400 in an auth callback is the
    // hardest kind of failure to diagnose, because the user sees a blank page and the server
    // says nothing.
    console.error("SproutOS token exchange failed:", error)
    return new Response(null, { status: 400 })
  }

  let profile: SproutOSProfile
  let introspection: SproutOSIntrospection
  try {
    const [profileResponse, introspectResponse] = await Promise.all([
      fetch(sproutosConfig.userinfoUrl!, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      /*
        Introspection authenticates the *client*, not the user, and SproutOS takes those
        credentials in `x-client-*` headers rather than in the body or via Basic. That is a
        deviation from RFC 7662, which reuses the token endpoint's client authentication -- and the
        token endpoint here does take them in the body, so the two endpoints on the same provider
        disagree. Sending them the way the RFC describes gets a 500: the handler reads a missing
        header as an empty client id and looks it up against a uuid column, and Postgres raises
        before any OAuth error can be returned.
      */
      fetch(sproutosConfig.introspectUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-client-id": sproutosConfig.clientId!,
          "x-client-secret": sproutosConfig.clientSecret!,
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: "access_token",
        }),
      }),
    ])
    if (!profileResponse.ok || !introspectResponse.ok) {
      console.error(
        `SproutOS identity lookup failed: profile ${profileResponse.status}, ` +
          `introspect ${introspectResponse.status}`,
      )
      return new Response(null, { status: 400 })
    }
    profile = (await profileResponse.json()) as SproutOSProfile
    introspection = (await introspectResponse.json()) as SproutOSIntrospection
  } catch (error) {
    console.error("SproutOS identity lookup threw:", error)
    return new Response(null, { status: 400 })
  }

  // A token the provider reports as inactive must not produce a session, even though the
  // exchange that produced it succeeded a moment ago.
  if (introspection.active !== true) {
    console.error("SproutOS introspection reports the token inactive")
    return new Response(null, { status: 400 })
  }

  const providerAccountId = introspection.sub
  const email = profile.email
  // Without a stable subject and an email there is no identity to link an account to, and
  // guessing one would risk joining two different people onto the same user.
  if (!providerAccountId || !email) {
    console.error(
      `SproutOS identity incomplete: sub=${providerAccountId ? "present" : "missing"}, ` +
        `email=${email ? "present" : "missing"}`,
    )
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
      scope: sproutosConfig.scopes.join(" "),
      idToken: null,
      accessToken,
      tokenType: "Bearer",
      expiresAt: null,
    },
  )

  return new Response(null, {
    status: 302,
    headers: { Location: isNewAccount ? "/onboarding" : "/" },
  })
}
