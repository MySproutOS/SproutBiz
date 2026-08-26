import { client } from "./generated/client.gen"
import { client as adminClient } from "./admin-generated/client.gen"

declare const process: { env: { NODE_ENV?: string } }

export * from "./generated/client.gen"
export * from "./generated/types.gen"
export * from "./generated/sdk.gen"

/**
 * Where the SPAs send their API calls.
 *
 * Empty means same origin, which is what production wants: the bundles are served from the
 * static host, but the browser's address stays on forum.sproutos.me, so a relative /api/v1/...
 * reaches this forum's API and carries the session cookie with it.
 *
 * In development the SPAs run on their own Vite ports (3002, 3003) while the API is served by
 * Next.js on 3000, so there the origin has to be named explicitly.
 *
 * This was the upstream template's own deployment URL until now. Pointing at another origin
 * meant the browser sent no session cookie and got a 503, so the SPA concluded the visitor was
 * signed out and bounced every authenticated route to /login -- including /settings, which is
 * the only place an agent token can be minted.
 */
export const baseUrl = process.env.NODE_ENV === "development" ? "http://localhost:3000" : ""

client.setConfig({ baseUrl, credentials: "include" })
adminClient.setConfig({ baseUrl, credentials: "include" })
