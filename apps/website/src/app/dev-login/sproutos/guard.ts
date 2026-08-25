/** The stub must never be reachable outside local development: it hands out identities
 *  for the asking. Mirrors the guard on /dev-login. */
export function stubDisabled(request: Request): boolean {
  if (process.env.NODE_ENV !== "development") return true
  const hostname = new URL(request.url).hostname
  return hostname !== "localhost" && hostname !== "127.0.0.1"
}
