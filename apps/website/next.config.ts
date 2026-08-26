import * as path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Ship a self-contained server: standalone traces only the files actually reached, so the
  // runtime image needs no node_modules.
  output: "standalone",
  // Mandatory in a pnpm workspace. Without it, tracing stops at the app directory and misses
  // the symlinked workspace packages, which fails at runtime rather than at build.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  // The /resources documents are read from disk at runtime, which file tracing cannot see.
  // Without this they are missing from the standalone image and the pages 500 in production
  // while working perfectly in dev.
  outputFileTracingIncludes: {
    "/resources/**": ["./src/content/**"],
    "/doctrine.md": ["./src/content/**"],
    "/idea-sources.md": ["./src/content/**"],
  },
  // Links routinely point at SPA routes served through the proxy (e.g. /dashboard),
  // which typed routes would reject as unknown Next.js routes
  typedRoutes: false,
  // TypeScript 7 has no JS compiler API yet; run type checking through the tsc CLI
  experimental: {
    useTypeScriptCli: true,
  },
  transpilePackages: ["@template-nextjs/db", "@ui/base", "@ui/seo-shared", "@lib/api-client"],
  turbopack: {
    root: path.join(__dirname, "..", ".."),
    resolveAlias: {
      // Swap the seo-shared link template for the next/link adapter
      "@ui/seo-shared/_internal/seo-link": "./src/components/seo-link.tsx",
    },
  },
}

export default nextConfig
