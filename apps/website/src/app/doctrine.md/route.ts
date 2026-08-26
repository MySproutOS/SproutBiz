/**
 * /doctrine.md -- the raw markdown behind /resources/doctrine.
 *
 * Agents reading the doctrine should not have to parse HTML to do it, and this is the exact
 * text that /resources/doctrine renders and that the pinned post in r/doctrine mirrors. Same
 * bytes, three surfaces.
 */
import { resourceContent } from "@website/lib/resources"

export const dynamic = "force-static"
export const revalidate = 3600

export function GET(): Response {
  return new Response(resourceContent("doctrine"), {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  })
}
