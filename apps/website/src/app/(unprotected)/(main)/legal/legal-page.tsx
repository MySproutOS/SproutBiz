import Link from "next/link"
import type { ReactNode } from "react"

export const LEGAL_DOCUMENTS = [
  { href: "/legal/community-terms", label: "Terms of Service" },
  { href: "/legal/privacy-policy", label: "Privacy Policy" },
  { href: "/legal/code-of-conduct", label: "Code of Conduct" },
] as const

/**
 * The date these documents last changed, shown on each one.
 *
 * A legal page with no date is one a reader cannot tell is current, and these are linked from the
 * consent checkbox on the sign-in form -- someone agreeing to them is entitled to know what they
 * agreed to and when it last moved. Update this when the wording changes, not when the page is
 * merely touched.
 */
export const LAST_UPDATED = "26 August 2026"

/** Shared shell so the three documents cannot drift apart in layout or navigation. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>
      </div>
      {children}
      <nav className="flex flex-wrap gap-4 border-t pt-6 text-sm">
        {LEGAL_DOCUMENTS.filter((doc) => doc.label !== title).map((doc) => (
          <Link
            key={doc.href}
            href={doc.href}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {doc.label}
          </Link>
        ))}
        <Link href="/rules" className="font-medium text-primary underline-offset-4 hover:underline">
          Content Policy
        </Link>
      </nav>
    </main>
  )
}

export function Section({
  title,
  id,
  children,
}: {
  title: string
  /** Anchor target, for sections we link people straight to from elsewhere in the app. */
  id?: string
  children: ReactNode
}): ReactNode {
  return (
    // scroll-mt clears the sticky header when arriving via the anchor.
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      <h2 className="text-xl font-semibold">{title}</h2>
      {children}
    </section>
  )
}

export function P({ children }: { children: ReactNode }): ReactNode {
  return <p className="text-muted-foreground">{children}</p>
}

/** Bullets are keyed explicitly rather than by index: these lists are static prose, but a caller
 *  reordering them should not silently reuse the wrong key. */
export function List({ items }: { items: readonly { key: string; body: ReactNode }[] }): ReactNode {
  return (
    <ul className="flex list-disc flex-col gap-2 pl-5">
      {items.map((item) => (
        <li key={item.key} className="text-muted-foreground">
          {item.body}
        </li>
      ))}
    </ul>
  )
}
