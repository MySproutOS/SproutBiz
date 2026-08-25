## Build Commands

```bash
# Install dependencies
pnpm install

# Start development server (website + API)
pnpm run dev --workspace=website

# Start SPA dev servers (separate terminals)
pnpm run dev --workspace=dashboard    # Dashboard SPA on port 3002
pnpm run dev --workspace=admin        # Admin SPA on port 3003

# Run all tests
pnpm test

# Run a single test file
npx vitest run path/to/file.test.ts --config .config/vitest.config.mts

# Lint and format
pnpm run format        # Oxfmt format with .config/oxfmt.config.ts
pnpm run lint          # Oxlint check with auto-fix

# Database
docker-compose up -d                              # Start PostgreSQL
pnpm run migrate:latest --workspace=dbmigrator     # Run migrations
pnpm run db-codegen --workspace=@queryme/db        # Generate Kysely types

# Create new migration
cd apps/dbmigrator/src && npx kysely migrate:make <name>

# Generate OpenAPI client (requires dev server running)
pnpm run openapi --workspace=website
```

## Browser automation (Claude in Chrome)

Two Chrome extensions are connected to this account, and only one of them can reach the
local dev server. The other fails every navigation with `Frame with ID 0 is showing error
page` even though the page serves fine over curl, which looks like an app bug and is not.

**Use `deviceId 2bd1938a-89f4-4008-8687-7334259f3cce`** (listed as "Browser 1", named "Han"
when connected interactively). Select it before any browser action:

```
mcp__claude-in-chrome__select_browser  deviceId=2bd1938a-89f4-4008-8687-7334259f3cce
```

The other browser, `57d94861-7978-45e5-b802-b9bd1ddccc9b` ("Browser 2"), does not work for
local development. Note that `list_connected_browsers` reports the generic "Browser 1" /
"Browser 2" names rather than any name set via `switch_browser`, so match on the deviceId.

**Click by element ref, not by pixel coordinate.** Screenshots come back at a different
scale to the page viewport (1436x840 vs 1200x702 here), so coordinates read off a screenshot
land in the wrong place and the click silently does nothing. Use `read_page` to get a
`ref_N` and pass that to `computer`. When a click should trigger a navigation, expect
`javascript_tool` to fail with "Inspected target navigated" -- that is success, not an error.

## Architecture

This is a TypeScript monorepo with npm workspaces:

**Apps:**

- `apps/website` - Next.js frontend with Tailwind/ShadCN UI. API routes are proxied through `/api`. Proxy (middleware) handles auth + rewrites for SPA routes
- `apps/internal-api` - Hono API with TypeBox schemas and OpenAPI generation. Mounted at `/api` via Next.js
- `apps/frontends/dashboard` - React SPA (Vite + TanStack Router) served at `/dashboard`. Requires authentication
- `apps/frontends/admin` - React SPA (Vite + TanStack Router) served at `/admin`. Requires authentication + is_admin
- `apps/dbmigrator` - Kysely database migrations

**Packages:**

- `packages/db` - Kysely database client and generated types (`@queryme/db`)
- `lib/typescript/dao` - Data access objects shared between API and website (`@lib/dao`)
- `lib/typescript/api-client` - Hey-API generated client code shared between website and SPAs (`@lib/api-client`)
- `lib/typescript/ui/components` - Shared ShadCN UI components and theme (`@ui/components`)
- `lib/typescript/utils/*` - Utility libraries (e.g., `@utils/numbers`)
