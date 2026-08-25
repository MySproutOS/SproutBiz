export const dynamic = "force-static"
export const revalidate = 3600

export function GET(request: Request): Response {
  const host = process.env.NEXT_PUBLIC_HOST_URL ?? new URL(request.url).origin

  // agents.txt is explicitly allowed, as its standard asks: a crawler that cannot fetch the
  // capability declaration cannot discover anything it points at.
  const body = `User-agent: *
Allow: /
Allow: /agents.txt
Allow: /llms.txt
Disallow: /api/
Disallow: /settings
Disallow: /onboarding

Sitemap: ${host}/sitemap.xml
`
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  })
}
