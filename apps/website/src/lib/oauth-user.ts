import { crudAccount } from "@lib/dao/account/crud"
import { fetchAccount } from "@lib/dao/account/fetch"
import { crudUser } from "@lib/dao/user/crud"
import { fetchUser } from "@lib/dao/user/fetch"
import { db } from "@template-nextjs/db"
import { createSession, generateSessionToken, setSessionTokenCookie } from "@website/lib/auth"

/** The identity an OAuth provider gives us, normalised across providers. */
export type OAuthIdentity = {
  providerAccountId: string
  email: string
  name: string | null
  image: string | null
}

export type OAuthTokenFields = {
  scope: string
  idToken: string | null
  accessToken: string
  tokenType: string
  expiresAt: number | null
}

export async function generateUniqueUsername(email: string): Promise<string> {
  const base =
    email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") || "user"
  let candidate = base
  while (await fetchUser(db).isUsernameTaken(candidate)) {
    const length = 4 + Math.floor(Math.random() * 3)
    const suffix = Math.random()
      .toString(36)
      .replace(/[^a-z0-9]/g, "")
      .slice(0, length)
    candidate = `${base}${suffix}`
  }
  return candidate
}

/**
 * Links a provider identity to a user, creating both if needed, and starts a session.
 *
 * Shared by every provider so account linking behaves identically across them: matching an
 * existing user by email means signing in with a second provider joins the existing account
 * rather than silently creating a duplicate.
 *
 * Returns whether the account was newly created, so callers can send first-time users to
 * onboarding instead of the front page.
 */
export async function completeOAuthLogin(
  provider: string,
  identity: OAuthIdentity,
  tokens: OAuthTokenFields,
): Promise<{ userId: string; isNewAccount: boolean }> {
  const existingAccount = await fetchAccount(db).getOneByProvider(
    provider,
    identity.providerAccountId,
    ["userId"],
  )

  if (existingAccount) {
    await startSession(existingAccount.userId)
    return { userId: existingAccount.userId, isNewAccount: false }
  }

  const existingUser = await fetchUser(db).getOneByEmail(identity.email, ["id"])
  const userId =
    existingUser?.id ??
    (
      await crudUser(db).createUser({
        name: identity.name,
        email: identity.email,
        image: identity.image,
        username: await generateUniqueUsername(identity.email),
      })
    ).id

  await crudAccount(db).createAccount({
    userId,
    provider,
    providerAccountId: identity.providerAccountId,
    type: "oauth",
    scope: tokens.scope,
    idToken: tokens.idToken,
    accessToken: tokens.accessToken,
    tokenType: tokens.tokenType,
    expiresAt: tokens.expiresAt,
  })

  await startSession(userId)
  return { userId, isNewAccount: true }
}

async function startSession(userId: string): Promise<void> {
  const sessionToken = generateSessionToken()
  const session = await createSession(sessionToken, userId)
  await setSessionTokenCookie(sessionToken, session.expires)
}
