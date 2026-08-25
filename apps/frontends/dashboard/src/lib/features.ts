/**
 * Client-side mirror of the server's feature flags.
 *
 * This only hides controls. The server is the actual gate -- every media endpoint returns 503
 * when uploads are off, regardless of what the UI shows -- so a stale or tampered client
 * cannot upload anything. The point here is simply not to offer a button that cannot work.
 */

/** Matches MEDIA_UPLOADS_ENABLED on the server. Off unless explicitly enabled. */
export const MEDIA_UPLOADS_ENABLED = import.meta.env.VITE_MEDIA_UPLOADS_ENABLED === "true"
