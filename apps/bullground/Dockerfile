# Build context is the REPO ROOT (pnpm workspace):
#   docker build -f apps/bullground/Dockerfile .
FROM node:24.14.0-bookworm-slim AS deploy
ENV NPM_CONFIG_FUND=false TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
RUN corepack enable
COPY . .
# No build step: no package in this workspace has one, and every package exports its TypeScript
# sources directly. The worker runs under tsx, as it already does in development. Adding real
# build outputs across the workspace would shrink this image, but it is not a deploy concern.
RUN pnpm install --frozen-lockfile --filter=bullground...

FROM node:24.14.0-bookworm-slim
ENV NODE_ENV=production NPM_CONFIG_FUND=false
WORKDIR /repo
# Activate the pinned pnpm at build time. With only `corepack enable`, pnpm is downloaded on
# every container start, so a registry blip becomes a container that will not boot.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY --from=deploy /repo /repo
# No ffmpeg: this fork has no transcoding job, and it would add ~250 MB for nothing.
CMD ["pnpm", "--filter=bullground", "exec", "tsx", "--max-old-space-size=1536", "src/index.ts"]
