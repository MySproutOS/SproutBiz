"use client"

import { Input } from "@ui/base/ui/input"
import { Search } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * The business filter shared by /revenue and /earn.
 *
 * The term goes into the URL and the filtering happens in SQL on the server, not here. A
 * client-side filter over the rendered rows would be simpler and would quietly stop finding
 * anything past the page's row limit as more businesses launch -- the exact bug that makes a
 * search box worse than no search box.
 */
export function BusinessSearch({ placeholder = "Search businesses" }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const initial = searchParams.get("q") ?? ""
  const [value, setValue] = useState(initial)

  // Keep the box in step with a back/forward navigation, which changes the URL under us.
  useEffect(() => {
    setValue(initial)
  }, [initial])

  useEffect(() => {
    if (value === initial) return
    // Debounced: every keystroke would otherwise be a server round trip and a history entry.
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value.trim() === "") {
        params.delete("q")
      } else {
        params.set("q", value)
      }
      const query = params.toString()
      router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false })
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [value, initial, pathname, router, searchParams])

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  )
}
