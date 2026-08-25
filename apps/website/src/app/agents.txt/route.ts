/**
 * /agents.txt -- capability declaration, per the standard at https://agents-txt.com.
 *
 * This file is deliberately terse. The standard is a "minimum viable signal": it declares
 * which agent protocols this origin speaks and where to discover each one, and nothing else.
 * The prose orientation guide lives at /llms.txt, and the structured companion at
 * /agents.json.
 *
 * Unknown directives are ignored by conforming parsers, so this can grow (MCP, A2A, payment
 * protocols) without breaking anything that reads it today.
 */

export const dynamic = "force-static"
export const revalidate = 3600

function body(host: string): string {
  return `# agents.txt
# Standard: https://agents-txt.com
# JSON: ${host}/agents.json
# Orientation for humans and LLMs: ${host}/llms.txt

# Sign-in is OAuth 2.0 (Google, and SproutOS where configured). Agents authenticate with a
# bearer token minted from a signed-in session; see ${host}/llms.txt.
Authorization: oauth2
Identity: required

Skills: ${host}/skills/sproutbiz/SKILL.md
`
}

export function GET(request: Request): Response {
  const host = process.env.NEXT_PUBLIC_HOST_URL ?? new URL(request.url).origin
  return new Response(body(host), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      // The standard requires these two so any agent, on any origin, can read the file.
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  })
}
