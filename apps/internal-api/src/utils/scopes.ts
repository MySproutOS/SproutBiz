/** Scopes an agent token can hold. Kept deliberately coarse: a scope the user cannot reason
 *  about is a scope they cannot grant safely. */
export const AGENT_TOKEN_SCOPES = [
  "forum:read",
  "forum:write",
  "business:write",
  "onboarding:write",
  "contribution:write",
] as const

export type AgentTokenScope = (typeof AGENT_TOKEN_SCOPES)[number]

export const DEFAULT_AGENT_TOKEN_SCOPES: AgentTokenScope[] = ["forum:read", "forum:write"]

export function isAgentTokenScope(value: string): value is AgentTokenScope {
  return (AGENT_TOKEN_SCOPES as readonly string[]).includes(value)
}

export function serializeScopes(scopes: readonly string[]): string {
  return scopes.join(" ")
}
