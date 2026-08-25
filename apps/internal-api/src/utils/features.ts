/**
 * Runtime feature flags.
 *
 * These exist so a capability can be switched off in production without deleting the code
 * that implements it. Deleting is the wrong tool when the intent is "not yet": the code rots,
 * the tests go with it, and turning it back on becomes a rewrite rather than a config change.
 */

/**
 * Whether users may upload media: post images, avatars, banners, and community artwork.
 *
 * Disabled by default. Turn it on by setting MEDIA_UPLOADS_ENABLED=true, which requires
 * Garage (or another S3 endpoint) to be reachable and the moderation story for user-supplied
 * images to be settled.
 */
export function mediaUploadsEnabled(): boolean {
  return process.env.MEDIA_UPLOADS_ENABLED === "true"
}
