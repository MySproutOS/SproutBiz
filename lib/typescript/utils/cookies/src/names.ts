/**
 * The name the session cookie is keyed on.
 *
 * Deliberately not `session`. This forum was originally served from `forum.sproutos.me`, a subdomain of the
 * SproutOS platform it signs users in against -- and SproutOS scopes its own session cookie to
 * `Domain=.sproutos.me`, so the browser offers that cookie to every host under the apex, this one
 * included. Both were called `session`.
 *
 * Two cookies of the same name are not an error the browser reports. It sends both, and RFC 6265
 * §5.4 orders them by path length and then by creation time -- host specificity is not a tiebreaker
 * at all. SproutOS's cookie is created first, because signing in there is what brings a user here,
 * so it arrives first and every `cookies.get("session")` in this codebase returned *its* token.
 * The result was a sign-in that completed perfectly on the server -- token exchanged, account
 * linked, session row written, a valid `Set-Cookie` sent -- and a browser that stayed anonymous.
 * `curl` could not reproduce it, because `curl` never had the SproutOS cookie.
 *
 * A distinct name is the whole fix, and it has to be one constant: a cookie written under one name
 * and read under another is silently never read, and one cleared under another name is never
 * cleared, which leaves a user signed in after pressing sign out.
 *
 * Renaming does not need a `Domain` of its own. Host-only is correct here -- the API is mounted
 * inside this same Next.js app at `/api`, so nothing off `sproutos.biz` ever needs to read it.
 * If the API is ever split onto its own host, that is the moment to add a `Domain`, and the moment
 * to remember that a wider scope means this name has to stay unique across every SproutOS host.
 */
export const SESSION_COOKIE_NAME = "sproutbiz_session"
