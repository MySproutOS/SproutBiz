import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { validateSessionToken } from "./lib/auth"

/** Public paths handled by Next.js — everything else goes to the dashboard SPA */
const NEXTJS_PUBLIC_PREFIXES = [
  "/login",
  "/blog",
  "/api",
  "/legal",
  "/about",
  "/rules",
  // Served by Next.js so it works immediately after an OAuth redirect, before the SPA loads.
  "/onboarding",
]
if (process.env.NODE_ENV === "development") {
  NEXTJS_PUBLIC_PREFIXES.push("/dev-login")
}

/** Exact public paths. Anything not matched here or by a prefix is redirected to /login for
 *  anonymous visitors, so machine-readable endpoints must be listed explicitly. */
const NEXTJS_PUBLIC_EXACT = new Set<string>([
  "/",
  // Machine-readable discovery files. Every one must be reachable anonymously, or the agents
  // they address cannot read them.
  "/agents.txt",
  "/agents.json",
  "/llms.txt",
  "/robots.txt",
  "/skills/sproutbiz/SKILL.md",
  "/revenue",
  "/donate",
  "/donate/thanks",
])

type SharedRoute = { path: string; spa: "dashboard" | "admin" }

/** Routes that serve Next.js for unauthenticated users, SPA for authenticated users.
 *  Paths use Next.js conventions: [param], [...catchAll], [[...optionalCatchAll]] */
const SHARED_ROUTES: SharedRoute[] = [
  { path: "/home", spa: "dashboard" },
  { path: "/posting", spa: "dashboard" },
  { path: "/posting/[id]", spa: "dashboard" },
  { path: "/user/[username]", spa: "dashboard" },
  { path: "/user/[username]/comments/[...rest]", spa: "dashboard" },
  { path: "/r/[name]", spa: "dashboard" },
  { path: "/r/[name]/comments/[...rest]", spa: "dashboard" },
  { path: "/r/[name]/wiki/[[...rest]]", spa: "dashboard" },
  { path: "/r/[name]/search", spa: "dashboard" },
  { path: "/popular", spa: "dashboard" },
  { path: "/explore", spa: "dashboard" },
  { path: "/search", spa: "dashboard" },
]

/** Match a URL pathname against a route pattern.
 *  - Static segments: exact match
 *  - [param]: matches exactly one segment
 *  - [...catchAll]: matches one or more segments (must be last)
 *  - [[...optionalCatchAll]]: matches zero or more segments (must be last)
 */
function matchRoute(pattern: string, pathname: string): boolean {
  const patternSegs = pattern.split("/").filter(Boolean)
  const pathSegs = pathname.split("/").filter(Boolean)

  for (let i = 0; i < patternSegs.length; i++) {
    const seg = patternSegs[i]

    if (seg.startsWith("[[...") && seg.endsWith("]]")) {
      return true
    }

    if (seg.startsWith("[...") && seg.endsWith("]")) {
      return pathSegs.length > i
    }

    if (seg.startsWith("[") && seg.endsWith("]")) {
      if (i >= pathSegs.length) return false
      continue
    }

    if (i >= pathSegs.length || pathSegs[i] !== seg) return false
  }

  return pathSegs.length === patternSegs.length
}

function findSharedRoute(pathname: string): SharedRoute | undefined {
  return SHARED_ROUTES.find((r) => matchRoute(r.path, pathname))
}

const SPA_ADMIN = {
  prefix: "/admin",
  devPort: 3003,
} as const

const DASHBOARD_DEV_PORT = 3002

function isNextJsRoute(pathname: string): boolean {
  if (NEXTJS_PUBLIC_EXACT.has(pathname)) return true
  return NEXTJS_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

function isAssetRequest(pathname: string): boolean {
  if (/\.\w+$/.test(pathname)) return true
  // Vite dev server internal paths
  if (/@vite|@react-refresh|@id|node_modules\/\.vite/.test(pathname)) return true
  return false
}

function handleCsrfAndCookies(request: NextRequest): NextResponse | null {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", request.nextUrl.pathname)

  if (request.method === "GET") {
    const response = NextResponse.next({ request: { headers: requestHeaders } })
    const token = request.cookies.get("session")?.value ?? null
    if (token !== null) {
      response.cookies.set("session", token, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        sameSite: "lax",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
      })
    }
    return response
  }

  // The local OAuth stub is called server-to-server by our own callback route, so it has no
  // Origin and uses Basic auth rather than Bearer. In production the provider's token
  // endpoint is a different host entirely and never reaches this proxy; the stub only looks
  // like a cross-site POST because it is temporarily hosted inside this app. It is
  // development-only and guarded at the route itself.
  if (
    process.env.NODE_ENV === "development" &&
    request.nextUrl.pathname.startsWith("/dev-login/")
  ) {
    return null
  }

  // Stripe's webhook is a server-to-server POST with no Origin, and its credential is the
  // signature in the stripe-signature header, which the route verifies against the raw body.
  // The CSRF check has nothing to offer here and would reject every event.
  if (request.nextUrl.pathname === "/api/v1/donation/webhook") {
    return null
  }

  // Bearer-authenticated requests are exempt from the CSRF origin check. CSRF exploits
  // *ambient* credentials: the browser attaches cookies to a cross-site request on its own,
  // so a state-changing request needs a same-origin proof. It never attaches an
  // Authorization header on its own -- an agent or server has to set it deliberately -- so a
  // bearer request cannot be forged cross-site and has nothing to prove. Without this,
  // `curl -X POST -H "Authorization: Bearer ..."` sends no Origin and 403s here before ever
  // reaching the API, which would make the whole agent-facing API write-only-in-theory.
  // Cookie-authenticated requests fall through to the unchanged check below.
  if (/^Bearer\s+\S/i.test(request.headers.get("Authorization") ?? "")) {
    return null
  }

  const originHeader = request.headers.get("Origin")
  const hostHeader = request.headers.get("X-Forwarded-Host") ?? request.headers.get("Host")
  if (originHeader === null || hostHeader === null) {
    return new NextResponse(null, { status: 403, headers: requestHeaders })
  }
  let origin: URL
  try {
    origin = new URL(originHeader)
  } catch {
    return new NextResponse(null, { status: 403, headers: requestHeaders })
  }
  if (origin.host !== hostHeader) {
    return new NextResponse(null, { status: 403, headers: requestHeaders })
  }

  return null
}

function rewriteToSpa(
  request: NextRequest,
  pathname: string,
  devPort: number,
  devBasePath: string,
  prodFolder: string,
): NextResponse {
  const isDev = process.env.NODE_ENV === "development"
  // Where the built SPA bundles are served from. In production this is the Garage bucket
  // behind Traefik; the website fetches index.html from it server-side, while the browser
  // loads the hashed assets directly using the absolute base baked in by Vite.
  const spaOrigin = isDev
    ? `http://localhost:${devPort}`
    : (process.env.SPA_ORIGIN ?? "https://static.forum.sproutos.me")

  const spaUrl = new URL(pathname, spaOrigin)
  spaUrl.search = request.nextUrl.search

  if (!isAssetRequest(pathname)) {
    if (isDev) {
      spaUrl.pathname = `${devBasePath}/`
    } else {
      spaUrl.pathname = `${prodFolder}/index.html`
    }
  }

  return NextResponse.rewrite(spaUrl)
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Shared routes — check auth, rewrite to SPA or fall through to Next.js
  const sharedRoute = findSharedRoute(pathname)
  if (sharedRoute) {
    const token = request.cookies.get("session")?.value ?? null
    if (token !== null) {
      const result = await validateSessionToken(token)
      if (result !== null) {
        if (sharedRoute.spa === "admin") {
          return rewriteToSpa(request, pathname, SPA_ADMIN.devPort, "/admin", "/admin")
        }
        return rewriteToSpa(request, pathname, DASHBOARD_DEV_PORT, "", "/dashboard")
      }
    }
    // No valid session → serve Next.js SSR page
    const csrfResult = handleCsrfAndCookies(request)
    if (csrfResult) return csrfResult
    return NextResponse.next()
  }

  // Next.js public routes — pass through with CSRF/cookie handling
  if (isNextJsRoute(pathname)) {
    const csrfResult = handleCsrfAndCookies(request)
    if (csrfResult) return csrfResult
    return NextResponse.next()
  }

  // Admin SPA — requires auth
  if (pathname === SPA_ADMIN.prefix || pathname.startsWith(`${SPA_ADMIN.prefix}/`)) {
    const token = request.cookies.get("session")?.value ?? null
    if (token !== null) {
      const result = await validateSessionToken(token)
      if (result !== null) {
        if (!result.user.isAdmin) {
          return NextResponse.redirect(new URL("/", request.url))
        }
        return rewriteToSpa(request, pathname, SPA_ADMIN.devPort, "/admin", "/admin")
      }
    }
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Everything else → Dashboard SPA if authenticated, otherwise redirect to login
  const token = request.cookies.get("session")?.value ?? null
  if (token !== null) {
    const result = await validateSessionToken(token)
    if (result !== null) {
      return rewriteToSpa(request, pathname, DASHBOARD_DEV_PORT, "", "/dashboard")
    }
  }
  return NextResponse.redirect(new URL("/login", request.url))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\..*).*)"],
}
