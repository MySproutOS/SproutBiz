import { Markdown } from "@ui/seo-shared/Markdown"
import { resourceContent, resourceMeta } from "@website/lib/resources"

const meta = resourceMeta("scorecard")

export const metadata = { title: meta.title, description: meta.blurb }

export default function ScorecardPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <Markdown content={resourceContent("scorecard")} className="prose-base" />
    </main>
  )
}
