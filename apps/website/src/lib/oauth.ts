import { Google, OAuth2Client } from "arctic"

export const oauthGoogle = new Google(
  // biome-ignore lint/style/noNonNullAssertion: process.env needs non-null assertion here
  process.env.GOOGLE_CLIENT_ID!,
  // biome-ignore lint/style/noNonNullAssertion: process.env needs non-null assertion here
  process.env.GOOGLE_CLIENT_SECRET!,
  // biome-ignore lint/style/noNonNullAssertion: process.env needs non-null assertion here
  `${process.env.NEXT_PUBLIC_HOST_URL!}/login/google/callback`,
)

/**
 * SproutOS sign-in.
 *
 * The provider is configured entirely from the environment rather than hard-coded, because
 * its endpoints are not fixed yet. Locally these point at the stub under /dev-login/sproutos,
 * which means the real authorization-code + PKCE + userinfo path runs end to end in
 * development -- only the remote provider is faked. When the real endpoints exist, they are
 * a configuration change and nothing else.
 */
export const sproutosConfig = {
  clientId: process.env.SPROUTOS_CLIENT_ID,
  clientSecret: process.env.SPROUTOS_CLIENT_SECRET,
  authorizeUrl: process.env.SPROUTOS_AUTHORIZE_URL,
  tokenUrl: process.env.SPROUTOS_TOKEN_URL,
  userinfoUrl: process.env.SPROUTOS_USERINFO_URL,
  scopes: (process.env.SPROUTOS_SCOPES ?? "openid email profile").split(" ").filter(Boolean),
}

/** The button and the routes are hidden unless every endpoint is configured, so a
 *  half-configured deploy shows no broken sign-in option. */
export function isSproutOSConfigured(): boolean {
  return Boolean(
    sproutosConfig.clientId &&
    sproutosConfig.clientSecret &&
    sproutosConfig.authorizeUrl &&
    sproutosConfig.tokenUrl &&
    sproutosConfig.userinfoUrl,
  )
}

export function oauthSproutOS(): OAuth2Client {
  if (!isSproutOSConfigured()) {
    throw new Error("SproutOS OAuth is not configured")
  }
  return new OAuth2Client(
    sproutosConfig.clientId!,
    sproutosConfig.clientSecret!,
    `${process.env.NEXT_PUBLIC_HOST_URL}/login/sproutos/callback`,
  )
}
