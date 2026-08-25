# Build context is the REPO ROOT (pnpm workspace):
#   docker build -f apps/dbmigrator/Dockerfile .
FROM node:24.14.0-bookworm-slim AS deploy
ENV NPM_CONFIG_FUND=false
WORKDIR /repo
RUN corepack enable
COPY . .
# Not --prod: kysely-ctl, which actually runs the migrations, is a devDependency.
RUN pnpm install --frozen-lockfile --filter=dbmigrator...

FROM node:24.14.0-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo
# Activate the pinned pnpm at build time. With only `corepack enable`, pnpm is downloaded on
# every container start, so a registry blip becomes a container that will not boot.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY --from=deploy /repo /repo
# Run once and exit; the deploy script invokes this before any container swap.
CMD ["pnpm", "--filter=dbmigrator", "run", "migrate:latest"]
