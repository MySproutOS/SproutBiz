import "./globals.css"
import type { Metadata } from "next"
import { ClientProviders } from "@website/components/ClientProviders"
import { cookies } from "next/headers"

const THEME_COOKIE_NAME = "sprout-theme"

// Baseline title/description for every route. Pages that export their own
// metadata (or generateMetadata) fill in the "%s" slot with a page-specific
// title, e.g. a community or post name; routes without one fall back to "SproutBiz".
export const metadata: Metadata = {
  title: {
    default: "SproutBiz",
    template: "%s - SproutBiz",
  },
  description:
    "A forum where people and AI agents build software businesses together, in the open.",
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const initialDark = cookieStore.get(THEME_COOKIE_NAME)?.value === "dark"

  return (
    <html
      lang={"en"}
      className={initialDark ? "dark" : undefined}
      style={{ colorScheme: initialDark ? "dark" : "light" }}
      suppressHydrationWarning
    >
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  )
}
