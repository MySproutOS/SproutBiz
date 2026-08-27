# Idea sources

[Rule 1](/resources/doctrine) says to enter markets where somebody unfunded is already
making real money. An agent with no starting point will ignore that and invent something
instead, so this is the standing answer to "where do I look".

Each entry says **where to look** and **what to extract**, because "go and browse the App
Store" reliably produces nothing. Each also says what link to come back with: the point is
to find a product that already exists and copy it, not to be inspired into inventing one.

> **If you read nothing else on this page, read “Start here”, the first section below.**
> Chrome extensions, Obsidian plugins, Notion integrations and templates, Shopify apps and
> AppSumo listings are small enough for one agent to clone in days, and every one of them
> publishes the traction number in the open. That is the shortest path from this page to a
> scorecard with real figures in it.

## The list

### Start here — small apps, and the easiest things to copy

**If you look in one place, look here.** In these ecosystems somebody else has already built
the audience, the payment rail and the distribution; the unit of software is small enough for one
agent to ship in days; and the public number — installs, users, downloads, units sold — does
Rule 1's work for you in a single glance. A plugin is the cheapest thing on this page to start
and the cheapest to kill.

Watch two things. The platform takes a cut, so it belongs in the Rule 0 arithmetic alongside
Stripe. And you are a tenant: the host can ship your feature themselves, which is a Rule 8 answer
you should write down before you build.

| Source                | Where to look                                      | What to extract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chrome Web Store**  | `chromewebstore.google.com/search/<keyword>`       | User counts are public and the bar to ship is close to zero, which cuts both ways — easy for us to enter, easy for everyone else too. Read the one-star reviews on free extensions past 100k users; the recurring complaint is usually the paid product. Check first that the thing is not a thin wrapper on an API whose per-call cost breaks Rule 0. **Link the `chromewebstore.google.com/detail/…` page; the user count is on it.**                                                                                                                 |
| **Obsidian plugins**  | `obsidian.md/plugins`                              | Community plugins are ranked with **public download counts**, which is the market research done for you. A plugin past 100k downloads whose issue tracker has gone unanswered is a proven audience with an absent maintainer. Willingness to pay is already established here — these users buy Sync and Publish — while the plugins themselves are almost all free, and that gap is the opportunity. **Link the plugin page and its GitHub repo: the open issues are feature requests written by the exact people who would pay.**                      |
| **Notion**            | `notion.com/integrations` + `notion.com/templates` | Two surfaces worth separating. Integrations show what teams bolt on to fill Notion's holes; the template gallery shows what people pay a **one-off** fee for, with creator pricing in the open. The buyer already pays per seat for the host product, which settles Rule 2's willingness question before you ask it. **Link the integration or template page with its price.** Mind Rule 0 in opposite directions: a template has no marginal cost at all, while an integration that syncs on a schedule is pure ongoing spend against a one-off price. |
| **Shopify App Store** | `apps.shopify.com/categories`                      | Install counts and paid tiers are published per app, and the buyer is a merchant who already accepts that software is a cost of doing business. A few thousand installs, a changelog that stopped two years ago, and one-star reviews naming the same missing feature is a validated market with the gap written down for you. **Link the `apps.shopify.com/<app>` page; install count and pricing tiers are both on it, which makes Rule 0 arithmetic possible before you build.**                                                                     |
| **AppSumo**           | `appsumo.com/browse`                               | Lifetime-deal sale counts and review volume are public, which makes it the cheapest read available on what a niche audience will actually hand money over for. Mind the Rule 0 trap: LTD pricing is a guaranteed per-unit loss on anything carrying ongoing token or API cost, so take the demand signal and leave the pricing model where you found it. **Link the deal page — the units sold and the review count are both on it.**                                                                                                                   |

### Where revenue is disclosed

Somebody states a real number because they are trying to sell, or because it has been verified. This is the strongest evidence Rule 1 accepts.

| Source            | Where to look                                       | What to extract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acquire.com**   | `acquire.com`                                       | The listings are the point, not the transaction — a seller publishes MRR, profit, churn and stack because nobody bids without them, which is Rule 1's evidence handed over voluntarily. Filter to under $50k asking price: small, unfunded and profitable is the exact shape we are looking for. **Read it to copy, not to buy.** **Link the listing — and because listings sit behind a free account and vanish when sold, paste the MRR, the asking price and the date you read them into the scorecard too.** |
| **Microns.io**    | `microns.io`                                        | The same trick one size down — curated micro-SaaS in the $1k–$50k band, where the MRR is the headline rather than buried in a data room. Small enough that one agent could plausibly rebuild the whole product, which is the only size worth copying. Far fewer listings than Acquire and far more signal in each. **Link the listing, and the live product it points at.**                                                                                                                                      |
| **TrustMRR**      | `trustmrr.com`                                      | Stripe-verified revenue badges: the one place a founder's number has been checked by something other than the founder. Cross-check anything found on Indie Hackers against it, and where the claimed and the verified figures diverge, believe the verified one. A small directory — read it once in a sitting rather than treating it as a recurring source. **Link the verified profile; an unverifiable badge is worth nothing as evidence.**                                                                 |
| **Indie Hackers** | `indiehackers.com/products?sorting=highest-revenue` | The best source anywhere for unfunded founders publishing real revenue, which is Rule 1's exact requirement — that sort order is the shortlist. Read the interviews for the channel that actually worked, and the failure posts for the thing to avoid; those are rarer and more useful. **Link the product page carrying the revenue figure, and the product's own site.**                                                                                                                                      |

### The big app stores

Bigger builds and a harder chart to read, but the deepest pool of paying demand.

| Source                | Where to look                                  | What to extract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple App Store**   | `apps.apple.com/us/charts/iphone`              | Category **top-grossing** charts, not top-free — grossing is evidence that somebody paid. Note that the web charts only publish Top Free and Top Paid; grossing exists solely in the App Store app on a device, so open it there. Read the two- and three-star reviews of the leaders: that is where the feature gaps are written down by the people who wanted them. Use search autofill to find the exact phrase real users type, which doubles as your ASO target. **Come back with the `apps.apple.com/…/id…` link.** |
| **Google Play Store** | `play.google.com/store/apps/category/BUSINESS` | The same, plus the install-count band that Apple hides — swap the category in that URL. A 100k-1M install app with a 3.5 rating and a changelog that stopped two years ago is the classic undermonetised target. Android skews non-US, so check the geography against Rule 0 before believing the revenue would transfer. **Come back with the `play.google.com/store/apps/details?id=…` link; the install band is on that page.**                                                                                        |

### Prompts, not proof

These produce a direction, never a competitor. Nothing here satisfies Rule 1 on its own — take the niche, then go find a real shipping product in the sections above and link that.

| Source                        | Where to look            | What to extract                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Superwall YouTube channel** | `youtube.com/@Superwall` | The 48-episode source of most of the doctrine. Operators state real numbers, real CPMs, and real paywall results, which almost nothing else on the internet does. New episodes are the main way these rules get amended. **Link the episode with a timestamp on the claim you are leaning on, and link the operator's actual app.**                                                                                                                                                                                                                                                                     |
| **gregisenberg.com**          | `gregisenberg.com`       | Idea frameworks and "boring business times software" patterns; good at surfacing community-shaped niches early. Treat the ideas as prompts rather than validation — they are unproven by design, and still owe Rules 0 through 3. **This is the one source that hands you an idea with no product attached, so it does not satisfy Rule 1 on its own: take the niche, then go find a real shipping competitor in one of the stores below and link that.**                                                                                                                                               |
| **VentureBeat**               | `venturebeat.com`        | Funding announcements as a demand signal: what problems investors just paid for. Invert it — a funded competitor is a reason to avoid that exact market under Rule 1 — but the round proves the pain is real. Look one niche sideways from the company that raised. **Checked 2026-08-27: it has become an enterprise-AI publication — `/category/venture` now 404s and there is no funding section in the nav at all. It is the weakest entry here; if a fair run produces nothing, delete it and say so.** **Link the article and the funded company's own site, so the sideways step is auditable.** |

## How to use it

- A source produces a **candidate**, never a decision. Everything found here still runs the
  full [scorecard](/resources/scorecard).
- **Record which source each idea came from.** It is a row on the scorecard for a reason:
  over time we learn which of these produced money and which merely produced activity, and
  we cut the ones that produced activity.
- **Copy something that exists, and prove it with a link.** Every candidate arrives with at
  least one live link to a competitor's own page — a store listing, a marketplace listing, a
  product site. A competitor you cannot link to is a competitor you invented, and Rule 1 does
  not accept it. Invention is fine in plenty of places; it is not fine in the row that claims
  somebody is already making money at this.
- **The marketplaces are for reading, not buying.** A listing is a competitor's P&L,
  published voluntarily in order to sell. Acquiring anything is a Budget question and goes
  through Andrew; reading what somebody discloses costs nothing.
- Add sources as you find them. Delete any that have produced nothing after a fair run —
  and say so here, rather than quietly dropping it, so nobody re-adds it in six months.

## How to actually run the sweep

**Drive a real browser, not `curl`.** Every source above is a JavaScript app, and several block
scripted fetches outright — VentureBeat answers `curl` with a 429 and renders fine in a browser.
Use [Claude in Chrome](https://claude.com/chrome): it opens each store in a real tab with your
real session, which is the difference between reading a chart and guessing at one. It is also
the only way to reach the two places that matter most and are closed to a fetch — Apple's Top
Grossing chart, which exists only inside the App Store app, and any Acquire listing sitting
behind a free account.

The loop that works, one source per pass:

1. Open the store and sort it the way the table says.
2. Read the two- and three-star reviews of the top three, not the marketing copy.
3. Copy the product link and the public number — installs, users, units sold, MRR.
4. Move to the next source. Do not stop to evaluate; evaluation is the scorecard's job.

**Run it on a timer rather than in one sitting:** `/loop 1m` with the sweep as its prompt gives
each source its own pass, so a dead end costs one minute instead of the whole session, and the
sweep survives a store that rate-limits you. Twelve sources is roughly a twelve-minute loop.

## What is not on the list, and why

Trend aggregators, "startup idea" newsletters, and AI-generated idea lists are excluded on
purpose. They optimise for how interesting an idea sounds, which is uncorrelated with
whether anyone pays for it, and they cannot answer the only question Rule 1 asks: is
somebody already making money at this without venture funding behind them?

Reddit and niche forums are missing for a different reason — they are excellent for
understanding a problem in the user's own words, and useless for establishing that the
problem is monetisable. Use them _after_ a source above has produced a candidate, to write
Rule 2's one specific sentence about who pays.
