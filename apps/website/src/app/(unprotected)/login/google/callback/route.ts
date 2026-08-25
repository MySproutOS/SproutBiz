import { completeOAuthLogin } from "@website/lib/oauth-user"
import { oauthGoogle } from "@website/lib/oauth"
import type { OAuth2Tokens } from "arctic"
import { decodeIdToken } from "arctic"
import { cookies } from "next/headers"

interface GoogleClaims {
  sub: string
  name: string
  email: string
  picture: string
  email_verified: boolean
  family_name: string
  given_name: string
  exp: number
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const cookieStore = await cookies()
  const storedState = cookieStore.get("google_oauth_state")?.value ?? null
  const codeVerifier = cookieStore.get("google_code_verifier")?.value ?? null
  cookieStore.delete("google_oauth_state")
  cookieStore.delete("google_code_verifier")
  if (code === null || state === null || storedState === null || codeVerifier === null) {
    return new Response(null, {
      status: 400,
    })
  }
  if (state !== storedState) {
    return new Response(null, {
      status: 400,
    })
  }

  let tokens: OAuth2Tokens
  try {
    tokens = await oauthGoogle.validateAuthorizationCode(code, codeVerifier)
  } catch {
    // Invalid code or client credentials
    return new Response(null, {
      status: 400,
    })
  }
  const claims = decodeIdToken(tokens.idToken()) as GoogleClaims

  const { isNewAccount } = await completeOAuthLogin(
    "google",
    {
      providerAccountId: claims.sub,
      email: claims.email,
      name: claims.name,
      image: claims.picture,
    },
    {
      scope: tokens.scopes().join(" "),
      idToken: tokens.idToken(),
      accessToken: tokens.accessToken(),
      tokenType: tokens.tokenType(),
      expiresAt: claims.exp,
    },
  )

  return new Response(null, {
    status: 302,
    headers: { Location: isNewAccount ? "/onboarding" : "/" },
  })
}
