# Build context is the REPO ROOT (pnpm workspace), not this directory:
#   docker build -f apps/website/Dockerfile .
FROM node:24.14.0-bookworm-slim AS build
ENV NPM_CONFIG_FUND=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile

# NEXT_PUBLIC_* is inlined at build time, so it has to be present here rather than at runtime.
ARG NEXT_PUBLIC_HOST_URL=https://forum.sproutos.me
ENV NEXT_PUBLIC_HOST_URL=$NEXT_PUBLIC_HOST_URL
RUN pnpm exec turbo run build --filter=website

FROM node:24.14.0-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
# `output: "standalone"` traces only the files actually reached, so the runtime image needs
# no node_modules of its own. outputFileTracingRoot is what makes that work in a workspace.
COPY --from=build /repo/apps/website/.next/standalone ./
COPY --from=build /repo/apps/website/.next/static ./apps/website/.next/static
# No public/ directory in this app; add a COPY for it here if one is ever introduced.
EXPOSE 3000
CMD ["node", "apps/website/server.js"]
