import { Loader2, type LucideProps } from "lucide-react"

export const Icons = {
  spinner: Loader2,
  // A sprout: two leaves off a stem, drawn with currentColor so it inherits button styling.
  sproutos: (props: LucideProps) => (
    <svg
      {...props}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>SproutOS</title>
      <path d="M12 21V11" />
      <path d="M12 11C12 7.7 9.5 5 6 5c0 3.3 2.5 6 6 6z" />
      <path d="M12 11c0-3.3 2.5-6 6-6 0 3.3-2.5 6-6 6z" />
    </svg>
  ),
}
