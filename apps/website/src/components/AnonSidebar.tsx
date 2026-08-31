import { getCurrentSession } from "@website/lib/auth"
import { Banknote, Compass, Home, TrendingUp } from "lucide-react"
import Link from "next/link"

const MAIN_LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/popular", label: "Popular", icon: TrendingUp },
  { href: "/explore", label: "Explore", icon: Compass },
  { href: "/earn", label: "Earn Money", icon: Banknote },
]

const RESOURCE_LINKS = [
  { href: "/about", label: "About SproutBiz" },
  { href: "/resources", label: "Resources" },
  { href: "/rules", label: "SproutBiz Rules" },
  { href: "/legal", label: "Legal" },
]

/**
 * Left sidebar for the public SSR pages. Mirrors the authenticated dashboard sidebar's top-level
 * navigation without any interactive state.
 *
 * Not purely anonymous any more, despite the name: `/` is the landing page for signed-in users too,
 * so the sign-in prompt has to know whether there is anything to prompt for.
 */
export async function AnonSidebar() {
  const session = await getCurrentSession()
  return (
    <aside className="hidden w-64 shrink-0 border-r md:block">
      <div className="sticky top-14 flex max-h-[calc(100svh-3.5rem)] flex-col gap-4 overflow-y-auto p-4">
        <nav>
          <ul className="flex flex-col gap-0.5">
            {MAIN_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="flex h-10 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          {session === null ? (
            <>
              <Link href="/login" className="font-medium text-primary hover:underline">
                Log in
              </Link>{" "}
              to join communities and create your own.
            </>
          ) : (
            <>
              Signed in as{" "}
              <Link
                href={`/user/${session.user.username}`}
                className="font-medium text-primary hover:underline"
              >
                {session.user.username}
              </Link>
              .
            </>
          )}
        </div>

        <div>
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resources
          </p>
          <ul className="flex flex-col gap-0.5">
            {RESOURCE_LINKS.map(({ href, label }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="flex h-10 items-center rounded-md px-2 text-sm hover:bg-accent"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  )
}
