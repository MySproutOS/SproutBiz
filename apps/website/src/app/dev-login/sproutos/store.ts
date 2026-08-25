/**
 * In-memory state for the local SproutOS OAuth stub.
 *
 * Deliberately not persisted: it exists only so the real authorization-code flow has
 * something to talk to in development, and it should not survive a restart.
 */
type StubClaims = { sub: string; email: string; name: string }

const codes = new Map<string, StubClaims>()
const accessTokens = new Map<string, StubClaims>()

export function issueCode(claims: StubClaims): string {
  const code = `devcode_${crypto.randomUUID()}`
  codes.set(code, claims)
  return code
}

/** Authorization codes are single-use, same as a real provider. */
export function redeemCode(code: string): StubClaims | null {
  const claims = codes.get(code) ?? null
  codes.delete(code)
  return claims
}

export function issueAccessToken(claims: StubClaims): string {
  const token = `devtok_${crypto.randomUUID()}`
  accessTokens.set(token, claims)
  return token
}

export function lookupAccessToken(token: string): StubClaims | null {
  return accessTokens.get(token) ?? null
}
