import { buttonVariants } from "@ui/base/ui/button"
import { Input } from "@ui/base/ui/input"
import { getCurrentSession } from "@website/lib/auth"
import { Search } from "lucide-react"
import Link from "next/link"

/**
 * Top navigation for the public server-rendered pages.
 *
 * It used to be unconditionally logged-out, which was true while `/` was served only to anonymous
 * visitors and the dashboard SPA took over once you signed in. `/` is now the landing page for
 * everyone, so that assumption stopped holding in the worst possible place: the OAuth callback
 * redirects here, and a user who had just signed in successfully arrived to a header offering them
 * a "Log In" button. There is no way to read that except as the sign-in having failed.
 */
export async function SiteTopNav() {
  const session = await getCurrentSession()
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
        {/* Left zone: logo */}
        <div className="flex flex-1 items-center">
          <Link href="/" className="text-lg font-bold text-primary">
            SproutBiz
          </Link>
        </div>

        {/* Center zone: search, horizontally centered with a max width */}
        <div className="hidden min-w-0 flex-1 justify-center sm:flex">
          <div className="relative w-full max-w-2xl">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search SproutBiz"
              aria-label="Search"
              className="h-10 rounded-full border-0 bg-muted/60 pl-10"
              disabled
            />
          </div>
        </div>

        {/* Right zone: actions */}
        <div className="flex flex-1 items-center justify-end gap-2">
          {/* Shown to everyone: the whole point of the programme is that you do not have to
              have an account here already to be worth paying. */}
          <Link href="/earn" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Earn Money
          </Link>
          {session === null ? (
            <Link href="/login" className={buttonVariants({ size: "sm" })}>
              Log In
            </Link>
          ) : (
            <>
              <Link href="/popular" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Feed
              </Link>
              {/* By username, not `name`: `name` is a display string and for OAuth accounts is
                  usually the email address, which is neither a URL nor something to put in a
                  header. */}
              <Link
                href={`/user/${session.user.username}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {session.user.username}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
