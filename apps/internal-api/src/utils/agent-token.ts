import { sha256 } from "@oslojs/crypto/sha2"
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from "@oslojs/encoding"

/** Recognisable prefix so a leaked token is greppable in logs and scanners can pattern-match it. */
const TOKEN_PREFIX = "sof_"

/** Number of leading characters kept in clear for display. Enough to tell tokens apart,
 *  far too few to brute-force the remaining entropy. */
const DISPLAY_PREFIX_LENGTH = 12

/** 24 bytes = 192 bits of entropy, matching the strength of the session tokens in
 *  apps/website/src/lib/auth.ts (which use the same primitives). */
export function generateAgentToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return `${TOKEN_PREFIX}${encodeBase32LowerCaseNoPadding(bytes)}`
}

/** Byte-identical to how session tokens are hashed, so both credentials get the same
 *  at-rest treatment: the plaintext is never stored and cannot be recovered. */
export function hashAgentToken(token: string): string {
  return encodeHexLowerCase(sha256(new TextEncoder().encode(token)))
}

export function agentTokenDisplayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH)
}

/** Pulls the credential out of an `Authorization: Bearer <token>` header.
 *  Returns null when the header is absent or is some other scheme. */
export function parseBearerToken(header: string | undefined): string | null {
  if (!header) return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? match[1] : null
}
